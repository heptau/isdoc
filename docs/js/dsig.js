// XMLDSig verification (enveloped signature in ISDOC) without external libraries: C14N + WebCrypto.
// Checks mathematical validity (reference digests + SignedInfo signature) and reads certificate details.
// It does NOT verify the trust of the certificate chain up to a CA (offline).
export const DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const XMLNS = 'http://www.w3.org/2000/xmlns/';

/** Verification error with a code (the app translates it into the UI language). */
class SigError extends Error {
	constructor(code, arg = '') { super(code + (arg ? ': ' + arg : '')); this.code = code; this.arg = arg; }
}

const C14N = {
	'http://www.w3.org/TR/2001/REC-xml-c14n-20010315': { exclusive: false },
	'http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments': { exclusive: false },
	'http://www.w3.org/2001/10/xml-exc-c14n#': { exclusive: true },
	'http://www.w3.org/2001/10/xml-exc-c14n#WithComments': { exclusive: true }
};
const ENVELOPED = DSIG + 'enveloped-signature';
const DIGESTS = {
	[DSIG + 'sha1']: 'SHA-1',
	'http://www.w3.org/2001/04/xmlenc#sha256': 'SHA-256',
	'http://www.w3.org/2001/04/xmldsig-more#sha384': 'SHA-384',
	'http://www.w3.org/2001/04/xmlenc#sha512': 'SHA-512'
};
const SIGALGS = {
	[DSIG + 'rsa-sha1']: { type: 'rsa', hash: 'SHA-1' },
	'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256': { type: 'rsa', hash: 'SHA-256' },
	'http://www.w3.org/2001/04/xmldsig-more#rsa-sha384': { type: 'rsa', hash: 'SHA-384' },
	'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512': { type: 'rsa', hash: 'SHA-512' },
	'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256': { type: 'ec', hash: 'SHA-256' },
	'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384': { type: 'ec', hash: 'SHA-384' },
	'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512': { type: 'ec', hash: 'SHA-512' }
};

/* ---------------------------- Canonicalization ---------------------------- */

function scopeOf(el) {
	const chain = [];
	for (let n = el; n && n.nodeType === 1; n = n.parentNode) chain.unshift(n);
	const m = new Map();
	for (const e of chain) addDecls(m, e);
	return m;
}
function addDecls(map, el) {
	for (const a of el.attributes) {
		if (a.namespaceURI === XMLNS) map.set(a.localName === 'xmlns' ? '' : a.localName, a.value);
	}
}
const escText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
const escAttr = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
	.replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');

function serialize(el, scope, rendered, opt) {
	scope = new Map(scope);
	addDecls(scope, el);

	let cands;
	if (opt.exclusive) {
		const used = new Set([el.prefix || '']);
		for (const a of el.attributes) if (a.namespaceURI !== XMLNS && a.prefix) used.add(a.prefix);
		for (const p of opt.prefixes) used.add(p === '#default' ? '' : p);
		cands = [...used].map(p => [p, scope.get(p)]);
	} else {
		cands = [...scope];
	}
	const nsOut = [];
	const newRendered = new Map(rendered);
	for (let [p, uri] of cands) {
		if (p === 'xml') continue;
		if (uri === undefined) {
			if (p !== '') continue; // undeclared prefix
			uri = '';
		}
		const prev = rendered.get(p);
		if (p === '' && uri === '' && !prev) continue;
		if (prev === uri) continue;
		newRendered.set(p, uri);
		nsOut.push([p, uri]);
	}
	nsOut.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

	const attrs = [...el.attributes].filter(a => a.namespaceURI !== XMLNS).sort((a, b) => {
		const ua = a.namespaceURI || '', ub = b.namespaceURI || '';
		if (ua !== ub) return ua < ub ? -1 : 1;
		return a.localName < b.localName ? -1 : a.localName > b.localName ? 1 : 0;
	});

	let s = '<' + el.tagName;
	for (const [p, uri] of nsOut) s += ' xmlns' + (p ? ':' + p : '') + '="' + escAttr(uri) + '"';
	for (const a of attrs) s += ' ' + a.name + '="' + escAttr(a.value) + '"';
	s += '>';
	for (const c of el.childNodes) {
		if (c.nodeType === 1) {
			if (c !== opt.skip) s += serialize(c, scope, newRendered, opt);
		} else if (c.nodeType === 3 || c.nodeType === 4) s += escText(c.nodeValue);
		else if (c.nodeType === 7) s += '<?' + c.target + (c.data ? ' ' + c.data : '') + '?>';
	}
	return s + '</' + el.tagName + '>';
}

/** Canonicalizes a Document or Element to text (UTF-8 encoding happens later). */
export function canonicalize(node, opt = {}) {
	opt = { exclusive: false, prefixes: [], skip: null, ...opt };
	if (node.nodeType === 9) {
		let s = '', seenRoot = false;
		for (const c of node.childNodes) {
			if (c.nodeType === 1) {
				seenRoot = true;
				if (c !== opt.skip) s += serialize(c, new Map(), new Map(), opt);
			} else if (c.nodeType === 7) {
				const pi = '<?' + c.target + (c.data ? ' ' + c.data : '') + '?>';
				s += seenRoot ? '\n' + pi : pi + '\n';
			}
		}
		return s;
	}
	return serialize(node, scopeOf(node.parentNode && node.parentNode.nodeType === 1 ? node.parentNode : node), new Map(), opt);
}

/* ------------------------------- Helpers ------------------------------- */

const enc = s => new TextEncoder().encode(s);
const b64 = s => Uint8Array.from(atob(s.replace(/\s+/g, '')), c => c.charCodeAt(0));
const kids = (el, name, ns = DSIG) => [...el.children].filter(c => c.localName === name && c.namespaceURI === ns);
const kid = (el, name, ns = DSIG) => kids(el, name, ns)[0] || null;
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function findById(doc, id) {
	for (const e of doc.getElementsByTagName('*')) {
		for (const a of e.attributes) {
			if ((a.localName === 'Id' || a.localName === 'ID' || a.localName === 'id') && a.value === id) return e;
		}
	}
	return null;
}

function c14nParams(methodEl) {
	const alg = methodEl.getAttribute('Algorithm');
	const base = C14N[alg];
	if (!base) throw new SigError('c14n', alg);
	const inc = [...methodEl.children].find(c => c.localName === 'InclusiveNamespaces');
	return { exclusive: base.exclusive, prefixes: inc && inc.getAttribute('PrefixList') ? inc.getAttribute('PrefixList').split(/\s+/).filter(Boolean) : [] };
}

/* ------------------------------ DER / X.509 ------------------------------ */

function der(buf, off) {
	const tag = buf[off];
	let len = buf[off + 1], p = off + 2;
	if (len & 0x80) {
		const n = len & 0x7f;
		len = 0;
		for (let i = 0; i < n; i++) len = len * 256 + buf[p++];
	}
	return { tag, hdr: off, start: p, end: p + len };
}
function derKids(buf, n) {
	const out = [];
	for (let p = n.start; p < n.end;) {
		const c = der(buf, p);
		out.push(c);
		p = c.end;
	}
	return out;
}
function oid(buf, n) {
	const b = buf.subarray(n.start, n.end);
	const parts = [Math.floor(b[0] / 40), b[0] % 40];
	let v = 0;
	for (let i = 1; i < b.length; i++) {
		v = v * 128 + (b[i] & 0x7f);
		if (!(b[i] & 0x80)) { parts.push(v); v = 0; }
	}
	return parts.join('.');
}
function derString(buf, n) {
	const b = buf.subarray(n.start, n.end);
	if (n.tag === 0x1e) return new TextDecoder('utf-16be').decode(b);
	if (n.tag === 0x0c) return new TextDecoder('utf-8').decode(b);
	return new TextDecoder('latin1').decode(b);
}
function derTime(buf, n) {
	const s = new TextDecoder().decode(buf.subarray(n.start, n.end));
	const m = n.tag === 0x17 ? /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/.exec(s) : /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/.exec(s);
	if (!m) return null;
	let y = +m[1];
	if (n.tag === 0x17) y += y >= 50 ? 1900 : 2000;
	return new Date(Date.UTC(y, +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
}
const DN = { '2.5.4.3': 'CN', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.6': 'C', '2.5.4.5': 'serialNumber', '2.5.4.7': 'L', '2.5.4.97': 'organizationIdentifier' };
function derName(buf, n) {
	const parts = [];
	for (const set of derKids(buf, n)) {
		for (const atv of derKids(buf, set)) {
			const [o, v] = derKids(buf, atv);
			parts.push((DN[oid(buf, o)] || oid(buf, o)) + '=' + derString(buf, v));
		}
	}
	return parts.join(', ');
}
const CURVES = { '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521' };

export function parseCertificate(bytes) {
	const cert = der(bytes, 0);
	const tbs = derKids(bytes, derKids(bytes, cert)[0]);
	const i = tbs[0].tag === 0xa0 ? 1 : 0;
	const [issuer, validity, subject, spki] = [tbs[i + 2], tbs[i + 3], tbs[i + 4], tbs[i + 5]];
	const [nb, na] = derKids(bytes, validity);
	const alg = derKids(bytes, derKids(bytes, spki)[0]);
	const algOid = oid(bytes, alg[0]);
	return {
		subject: derName(bytes, subject),
		issuer: derName(bytes, issuer),
		notBefore: derTime(bytes, nb),
		notAfter: derTime(bytes, na),
		spki: bytes.slice(spki.hdr, spki.end),
		keyType: algOid === '1.2.840.113549.1.1.1' ? 'rsa' : algOid === '1.2.840.10045.2.1' ? 'ec' : algOid,
		curve: alg[1] && alg[1].tag === 0x06 ? CURVES[oid(bytes, alg[1])] : null
	};
}

/* ------------------------------- Verification ------------------------------- */

async function verifyOne(doc, sigEl) {
	const res = { ok: false, code: '', arg: '', signer: null, signingTime: null, checks: [] };
	const signedInfo = kid(sigEl, 'SignedInfo');
	if (!signedInfo) throw new SigError('noSignedInfo');

	// 1) reference
	for (const ref of kids(signedInfo, 'Reference')) {
		const uri = ref.getAttribute('URI') ?? '';
		let target;
		if (uri === '') target = doc;
		else if (uri[0] === '#') target = findById(doc, decodeURIComponent(uri.slice(1)));
		else throw new SigError('extRef', uri);
		if (!target) throw new SigError('noRef', uri);

		let params = { exclusive: false, prefixes: [] };
		let skip = null;
		const transforms = kid(ref, 'Transforms');
		if (transforms) {
			for (const t of kids(transforms, 'Transform')) {
				const alg = t.getAttribute('Algorithm');
				if (alg === ENVELOPED) skip = sigEl;
				else if (C14N[alg]) params = c14nParams(t);
				else throw new SigError('transform', alg);
			}
		}
		const hashName = DIGESTS[kid(ref, 'DigestMethod').getAttribute('Algorithm')];
		if (!hashName) throw new SigError('digest', kid(ref, 'DigestMethod').getAttribute('Algorithm'));
		const canon = canonicalize(target, { ...params, skip });
		const digest = new Uint8Array(await crypto.subtle.digest(hashName, enc(canon)));
		const expected = b64(kid(ref, 'DigestValue').textContent);
		const okRef = same(digest, expected);
		res.checks.push({ uri, ok: okRef });
		if (!okRef) {
			res.code = 'changed';
			res.arg = uri;
			return res;
		}
	}

	// 2) SignedInfo signature
	const sm = SIGALGS[kid(signedInfo, 'SignatureMethod').getAttribute('Algorithm')];
	if (!sm) throw new SigError('sigAlg', kid(signedInfo, 'SignatureMethod').getAttribute('Algorithm'));
	const siBytes = enc(canonicalize(signedInfo, c14nParams(kid(signedInfo, 'CanonicalizationMethod'))));
	const sigValue = b64(kid(sigEl, 'SignatureValue').textContent);

	const certEls = [...sigEl.getElementsByTagNameNS(DSIG, 'X509Certificate')];
	if (!certEls.length) throw new SigError('noCert');
	let verified = false, signer = null;
	for (const ce of certEls) {
		let cert;
		try { cert = parseCertificate(b64(ce.textContent)); } catch { continue; }
		if (cert.keyType !== sm.type) continue;
		try {
			const algo = sm.type === 'rsa'
				? { name: 'RSASSA-PKCS1-v1_5', hash: sm.hash }
				: { name: 'ECDSA', namedCurve: cert.curve };
			const key = await crypto.subtle.importKey('spki', cert.spki, algo, false, ['verify']);
			const ok = await crypto.subtle.verify(sm.type === 'rsa' ? algo : { name: 'ECDSA', hash: sm.hash }, key, sigValue, siBytes);
			if (ok) { verified = true; signer = cert; break; }
		} catch { /* try the next certificate */ }
	}
	if (!verified) {
		res.code = 'badSig';
		return res;
	}
	res.signer = signer;
	const st = sigEl.getElementsByTagNameNS('*', 'SigningTime')[0];
	if (st) res.signingTime = new Date(st.textContent.trim());
	res.ok = true;
	return res;
}

/** Finds and verifies all signatures of the document. */
export async function verifySignatures(doc) {
	const sigs = [...doc.getElementsByTagNameNS(DSIG, 'Signature')]
		.filter(s => !s.parentNode || s.parentNode.localName !== 'Object');
	if (!sigs.length) return { status: 'none', signatures: [] };
	const out = [];
	for (const s of sigs) {
		try {
			out.push(await verifyOne(doc, s));
		} catch (e) {
			out.push({ ok: false, error: true, code: e.code || '', arg: e.code ? e.arg : e.message, signer: null, checks: [] });
		}
	}
	const status = out.every(r => r.ok) ? 'valid' : out.some(r => r.error) && !out.some(r => !r.ok && !r.error) ? 'error' : 'invalid';
	return { status, signatures: out };
}
