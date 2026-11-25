// Signing of ISDOC XML (enveloped XMLDSig, as this viewer verifies it) with a certificate and private key the user
// added in the Sign dialog. Everything runs in the browser (WebCrypto); the key never leaves it: it is imported as a
// non-extractable CryptoKey and kept in IndexedDB, the PEM files are not stored.
//
// Compatible with the UOL client (https://github.com/heptau/uol, client/js/sign.js): same record format, same
// signature layout. Errors carry an i18n key (SignError.key, texts `ui_sign_*`), the app translates them.
//
// The signature protects against accidental changes of the file (the viewer shows "signature is valid -- the
// document has not been altered"); the certificate is not checked against a CA, a self-signed one is fine.
import { DSIG, canonicalize, parseCertificate, verifySignatures } from './dsig.js';

const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED = `${DSIG}enveloped-signature`;
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const ECDSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256';
const PROPS_NS = 'https://xml.uol.cz/dsig';

const ACTIVE = 'uol.sign.active';
const DB = 'uol-sign';
const STORE = 'certs';

/** Error with a dictionary key (without the `ui_` prefix). */
export class SignError extends Error {
	constructor(key) { super(key); this.key = key; this.vars = {}; }
}
const fail = key => { throw new SignError(key); };

/* ------------------------------ stored certificates ------------------------------ */

function open() {
	return new Promise((resolve, reject) => {
		if (!globalThis.indexedDB) { reject(new SignError('sign_storage')); return; }
		const rq = indexedDB.open(DB, 1);
		rq.onupgradeneeded = () => rq.result.createObjectStore(STORE, { keyPath: 'id' });
		rq.onsuccess = () => resolve(rq.result);
		rq.onerror = () => reject(new SignError('sign_storage'));
	});
}

async function tx(mode, fn) {
	const db = await open();
	try {
		return await new Promise((resolve, reject) => {
			const rq = fn(db.transaction(STORE, mode).objectStore(STORE));
			rq.onsuccess = () => resolve(rq.result);
			rq.onerror = () => reject(new SignError('sign_storage'));
		});
	} finally { db.close(); }
}

/** Stored certificates (with their keys), the newest last. */
export async function listCertificates() {
	return (await tx('readonly', (s) => s.getAll())).sort((a, b) => a.added - b.added);
}

export async function removeCertificate(id) {
	await tx('readwrite', (s) => s.delete(id));
	if (activeId() === id) setActiveId('');
}

/** The id of the certificate XML is signed with, '' = do not sign. */
export function activeId() { try { return localStorage.getItem(ACTIVE) || ''; } catch { return ''; } }
export function setActiveId(id) {
	try { if (id) localStorage.setItem(ACTIVE, id); else localStorage.removeItem(ACTIVE); } catch { /* storage unavailable */ }
	document.dispatchEvent(new CustomEvent('uol:signing-changed'));
}

/** The certificate to sign with, or null (signing off, certificate removed, storage unavailable). */
export async function activeCertificate() {
	const id = activeId();
	if (!id) return null;
	try { return (await tx('readonly', (s) => s.get(id))) || null; } catch { return null; }
}

/* ------------------------------ PEM / DER ------------------------------ */

const b64ToBytes = (s) => Uint8Array.from(atob(s.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
const bytesToB64 = (b) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

function pemBlocks(text) {
	const out = [];
	for (const m of text.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g)) out.push({ type: m[1], body: m[2] });
	return out;
}

function tlv(tag, ...parts) {
	const len = parts.reduce((n, p) => n + p.length, 0);
	const head = len < 128 ? [tag, len] : len < 256 ? [tag, 0x81, len] : len < 65536 ? [tag, 0x82, len >> 8, len & 255] : [tag, 0x83, len >> 16, (len >> 8) & 255, len & 255];
	const r = new Uint8Array(head.length + len);
	r.set(head);
	let o = head.length;
	for (const p of parts) { r.set(p, o); o += p.length; }
	return r;
}
const OID_RSA = Uint8Array.of(0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01);
const OID_EC = Uint8Array.of(0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01);
const OID_CURVE = {
	'P-256': Uint8Array.of(0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07),
	'P-384': Uint8Array.of(0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22),
	'P-521': Uint8Array.of(0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x23),
};

/** Private keys from PEM text as PKCS#8 DER: "PRIVATE KEY" as it is, "RSA PRIVATE KEY" (PKCS#1) and "EC PRIVATE KEY" (SEC1) wrapped. */
function privateKeys(blocks, curve) {
	const keys = [];
	for (const b of blocks) {
		const der = b64ToBytes(b.body);
		if (b.type === 'PRIVATE KEY') keys.push(der);
		else if (b.type === 'RSA PRIVATE KEY') keys.push(tlv(0x30, Uint8Array.of(0x02, 0x01, 0x00), tlv(0x30, OID_RSA, Uint8Array.of(0x05, 0x00)), tlv(0x04, der)));
		else if (b.type === 'EC PRIVATE KEY' && OID_CURVE[curve]) keys.push(tlv(0x30, Uint8Array.of(0x02, 0x01, 0x00), tlv(0x30, OID_EC, OID_CURVE[curve]), tlv(0x04, der)));
		else if (b.type === 'ENCRYPTED PRIVATE KEY' || /ENCRYPTED/.test(b.type)) fail('sign_encrypted');
	}
	return keys;
}

const algo = (cert) => (cert.keyType === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: cert.curve });
const signAlgo = (cert) => (cert.keyType === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash: 'SHA-256' });

/**
* Adds a certificate from the text of PEM files (certificate, optionally its chain, and the unencrypted private key;
* in one or several files). Returns the stored record. Throws a readable error when something is missing or the key
* does not belong to the certificate.
*/
export async function addCertificate(texts, name = '') {
	const blocks = texts.flatMap(pemBlocks);
	const certs = [];
	for (const b of blocks.filter((x) => x.type === 'CERTIFICATE' || x.type === 'TRUSTED CERTIFICATE')) {
		try { const der = b64ToBytes(b.body); certs.push({ der, info: parseCertificate(der) }); } catch { fail('sign_certificate'); }
	}
	if (!certs.length) fail('sign_nocert');
	if (!blocks.some((b) => /PRIVATE KEY/.test(b.type))) fail('sign_nokey');

	// the signer is the certificate the private key belongs to; the other ones are its chain
	const probe = new TextEncoder().encode('uol');
	for (const c of certs) {
		if (c.info.keyType !== 'rsa' && c.info.keyType !== 'ec') continue;
		for (const pkcs8 of privateKeys(blocks, c.info.curve)) {
			let key;
			try { key = await crypto.subtle.importKey('pkcs8', pkcs8, algo(c.info), false, ['sign']); } catch { continue; }
			try {
				const pub = await crypto.subtle.importKey('spki', c.info.spki, algo(c.info), false, ['verify']);
				const sig = await crypto.subtle.sign(signAlgo(c.info), key, probe);
				if (!await crypto.subtle.verify(signAlgo(c.info), pub, sig, probe)) continue;
			} catch { continue; }
			const chain = certs.filter((x) => x !== c);
			const rec = {
				id: crypto.randomUUID(),
				name: name || /CN=([^,]+)/.exec(c.info.subject)?.[1] || c.info.subject,
				subject: c.info.subject, issuer: c.info.issuer, notBefore: c.info.notBefore, notAfter: c.info.notAfter,
				keyType: c.info.keyType, curve: c.info.curve,
				certs: [c, ...chain].map((x) => bytesToB64(x.der)),
				key, added: Date.now(),
			};
			await tx('readwrite', (s) => s.put(rec));
			return rec;
		}
	}
	fail('sign_mismatch');
}

/* ------------------------------ signing ------------------------------ */

/**
 * Removes the existing XMLDSig signature(s) from the XML text (spliced out of the original text, the rest stays as it is),
 * so the document can be signed again. Throws when a signature remains afterwards (e.g. an unusual layout).
 */
export function stripSignatures(xml) {
	// Only elements in the XMLDSig namespace are removed (a same-named element of another vocabulary stays). The namespace is
	// found from the element's own xmlns declaration or, for a prefix, from a declaration anywhere in the text.
	const declares = (attrs, prefix) => new RegExp('\\sxmlns' + (prefix ? ':' + prefix.slice(0, -1).replace(/\./g, '\\.') : '') + '\\s*=\\s*["\']' + DSIG.replace(/[.]/g, '\\.') + '["\']').test(attrs);
	const out = xml.replace(/[ \t]*<((?:[\w.-]+:)?)Signature(?=[\s>])([^>]*)>[\s\S]*?<\/\1Signature>[ \t]*\r?\n?/g, (all, prefix, attrs) =>
		declares(attrs, prefix) || (prefix && declares(xml, prefix)) ? '' : all);
	const d = new DOMParser().parseFromString(out, 'application/xml');
	if (d.getElementsByTagName('parsererror').length || d.getElementsByTagNameNS(DSIG, 'Signature').length) fail('sign_xml');
	return out;
}


const bytes = (s) => new TextEncoder().encode(s);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
* Signs XML text with an enveloped XMLDSig signature (exclusive C14N, SHA-256, RSA or ECDSA) appended as the last
* child of the root element (spliced into the original text), with the certificate (and its chain) and the signing
* time. The result is verified
* with the same code the ISDOC viewer uses before it is returned.
*/
export async function signXml(xml, rec) {
	const m = /<\/[^<>\s]+\s*>\s*$/.exec(xml);
	if (!m || /^\s*<\?xml[^>]*\?>\s*<[^>]*\/>\s*$/.test(xml)) fail('sign_xml');
	const time = new Date().toISOString();
	const x509 = rec.certs.map((c) => `<X509Certificate>${c}</X509Certificate>`).join('');
	const sigMethod = rec.keyType === 'rsa' ? RSA_SHA256 : ECDSA_SHA256;
	const ref = (uri, transforms) => `<Reference URI="${uri}"><Transforms>${transforms}</Transforms><DigestMethod Algorithm="${SHA256}"/><DigestValue></DigestValue></Reference>`;
	const template = `<Signature xmlns="${DSIG}" Id="uol-sig"><SignedInfo><CanonicalizationMethod Algorithm="${EXC_C14N}"/>`
		+ `<SignatureMethod Algorithm="${sigMethod}"/>`
		+ ref('', `<Transform Algorithm="${ENVELOPED}"/><Transform Algorithm="${EXC_C14N}"/>`)
		+ ref('#uol-props', `<Transform Algorithm="${EXC_C14N}"/>`)
		+ `</SignedInfo><SignatureValue></SignatureValue><KeyInfo><X509Data>${x509}</X509Data></KeyInfo>`
		+ `<Object><SignatureProperties Id="uol-props"><SignatureProperty Target="#uol-sig"><SigningTime xmlns="${PROPS_NS}">${esc(time)}</SigningTime></SignatureProperty></SignatureProperties></Object></Signature>`;

	const parse = (text) => {
		const d = new DOMParser().parseFromString(text, 'application/xml');
		if (d.getElementsByTagName('parsererror').length) fail('sign_xml');
		return d;
	};
	const doc = parse(xml.slice(0, m.index) + template + xml.slice(m.index));
	const sig = [...doc.documentElement.children].find((c) => c.localName === 'Signature' && c.namespaceURI === DSIG);
	const el = (name, root = sig) => root.getElementsByTagNameNS(DSIG, name);
	const digest = async (canon) => bytesToB64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(canon))));

	// C14N only serves to compute the digests; the delivered file is the original text with the signature spliced in,
	// so the content, its order and its notation stay exactly as the database produced them
	const [refDoc, refProps] = el('DigestValue');
	refDoc.textContent = await digest(canonicalize(doc, { exclusive: true, skip: sig }));
	refProps.textContent = await digest(canonicalize(el('SignatureProperties')[0], { exclusive: true }));
	const signed = bytes(canonicalize(el('SignedInfo')[0], { exclusive: true }));
	const value = bytesToB64(new Uint8Array(await crypto.subtle.sign(signAlgo(rec), rec.key, signed)));
	const parts = [refDoc.textContent, refProps.textContent, value];
	const filled = template.replace(/<(DigestValue|SignatureValue)><\/\1>/g, (_, tag) => `<${tag}>${parts.shift()}</${tag}>`);
	const out = xml.slice(0, m.index) + filled + xml.slice(m.index);
	const check = await verifySignatures(parse(out));
	if (check.status !== 'valid') fail('sign_verify');
	return out;
}
