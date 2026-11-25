import { verifySignatures, fingerprint } from './dsig.js';
import { listCertificates, removeCertificate, addCertificate, activeId, setActiveId, signXml, stripSignatures } from './sign.js';
import { paymentInfo, spayd, epc, qrDataUrl } from './payment.js';
import { LANGS, detectLang, languageNames, loadStylesheet, getDict } from './lang.js';
import { TEMPLATES, DEFAULT_TEMPLATE } from './templates.js';
import { tolerantParse, rawHtml } from './tolerant.js';
import { validateIsdoc, NS_2009, NS_2013 } from './validate.js';

const $ = id => document.getElementById(id);

const stored = k => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* not persisted */ } };

// App language: the saved choice, otherwise the browser language.
let appLang = stored('lang');
if (!LANGS.includes(appLang)) appLang = detectLang();
// Invoice language: follows the app language until the user picks one (null). Never persisted.
let invLang = null;
const invoiceLang = () => invLang ?? appLang;
// Invoice layout variant (persisted).
let tplId = TEMPLATES.some(x => x.id === stored('tpl') && !x.raw) ? stored('tpl') : DEFAULT_TEMPLATE;
let current = null; // { doc, original, payment, qrs, sig, fileName, attachments, val, forceTpl?, rawText? }
let dict = {};    // dictionary of the app language
let invDict = {}; // dictionary of the invoice language (only for the payment text in the QR)
let lastError = null; // { key, vars } – so the error can be re-translated when the language changes

/** Error with a dictionary key (translated when displayed). */
class UiError extends Error {
	constructor(key, vars) { super(key); this.key = key; this.vars = vars || {}; }
}
/** Translates an ui_* key; {x} placeholders in the dictionary are replaced with values from vars. */
const t = (key, vars = {}) => String(dict['ui_' + key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const locale = () => dict.locale || appLang;

/* ------------------------------ Loading the file ------------------------------ */

function decodeXml(bytes) {
	const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
	const enc = /encoding\s*=\s*["']([\w.-]+)["']/i.exec(head);
	let label = 'utf-8';
	if (enc) { try { new TextDecoder(enc[1]); label = enc[1]; } catch { /* stays utf-8 */ } }
	return new TextDecoder(label).decode(bytes);
}

async function readInput(file) {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
	if (!isZip) return { xml: decodeXml(bytes), attachments: [], zip: null, mainName: '', raw: bytes };

	const zip = await JSZip.loadAsync(bytes);
	const entries = Object.values(zip.files).filter(f => !f.dir);
	const main = entries.find(f => /\.isdoc$/i.test(f.name)) || entries.find(f => /\.xml$/i.test(f.name) && !/manifest/i.test(f.name));
	if (!main) throw new UiError('e_noIsdoc');
	const raw = await main.async('uint8array'); // the invoice itself (for ISDOCX the .isdoc inside), its hash is printed
	const xml = decodeXml(raw);
	const attachments = entries.filter(f => f !== main && !/manifest\.xml$/i.test(f.name)).map(f => ({ name: f.name, entry: f }));
	return { xml, attachments, zip, mainName: main.name, raw };
}

/* ------------------------------ Display ------------------------------ */

/** List of ISDOCX attachments – clicking one downloads it. */
function renderAttachments() {
	const list = (current && current.attachments) || [];
	$('att').hidden = !list.length;
	const box = $('att-list');
	box.textContent = '';
	list.forEach((a, i) => {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'att-file';
		b.textContent = '⬇ ' + a.name;
		b.title = t('attDownload');
		b.addEventListener('click', () => downloadAttachment(list[i]));
		box.append(b);
	});
}

async function downloadAttachment(a) {
	try {
		const blob = await a.entry.async('blob');
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = a.name.split('/').pop().replace(/[\\:*?"<>|]/g, '_') || 'attachment';
		document.body.append(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	} catch (e) {
		showError(e);
	}
}

function showError(err) {
	lastError = err ? { key: err.key, vars: err.vars, tx: !!err.tx, msg: err.key ? null : (err.message || String(err)) } : null;
	const e = $('error');
	e.textContent = lastError ? (lastError.key ? t(lastError.key, lastError.vars) : lastError.msg) : '';
	e.hidden = !lastError;
}

function fmtDate(d) { return d ? d.toLocaleDateString(locale()) : '—'; }

/* ------------------------------ Trusted certificates ------------------------------ */

// The user's list of trusted certificates, identified by the SHA-256 fingerprint of the certificate (so a look-alike
// certificate with the same name is not trusted). Kept in localStorage: [{ fp, name, added }].
function trustedList() {
	try { const v = JSON.parse(stored('trusted') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
const isTrusted = fp => !!fp && trustedList().some(x => x.fp === fp);
function setTrusted(fp, name, on) {
	const list = trustedList().filter(x => x.fp !== fp);
	if (on) list.push({ fp, name, added: Date.now() });
	store('trusted', JSON.stringify(list));
}
/** Trust / untrust button (signature details and the sign dialog); re-renders what shows the trust state. */
function toggleTrust(fp, name) {
	setTrusted(fp, name, !isTrusted(fp));
	renderSig();
	if ($('signDlg').open) drawCerts();
	if (current && current.sigInfo && $('chk-sig').checked) renderInvoice(); // the printed note says whether the certificate is trusted
}
$('sig-body').addEventListener('click', e => {
	const b = e.target.closest('button[data-fp]');
	if (b) toggleTrust(b.dataset.fp, b.dataset.name);
});

/** Reason for an invalid signature / signature error, in the current language. */
function reasonText(s) {
	if (!s.code) return s.arg || '';
	return t('r_' + s.code, { a: s.arg || t('wholeDoc') });
}

function renderSignature(result) {
	const box = $('sig');
	if (result.status === 'none') {
		box.hidden = false;
		box.className = 'sig';
		$('sig-title').textContent = t('sigNoneTitle');
		$('sig-text').textContent = t('sigNoneText');
		$('sig-details').hidden = true;
		return;
	}
	const now = new Date();
	let cls = result.status === 'valid' ? 'ok' : 'bad';
	let title, text;
	const body = [];
	let certWarn = false;
	for (const s of result.signatures) {
		if (s.signer) {
			const at = s.signingTime || now;
			if (at < s.signer.notBefore || at > s.signer.notAfter) certWarn = true;
		}
		const dl = ['<dl>'];
		const row = (k, v, cls = '') => dl.push('<dt>' + k + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(v) + '</dd>');
		row(t('sigStatus'), s.ok ? t('sigOkState') : t(s.error ? 'sigErrState' : 'sigBadState', { r: reasonText(s) }));
		if (s.signer) {
			row(t('sigSigner'), s.signer.subject);
			row(t('sigIssuer'), s.signer.issuer);
			row(t('sigValidity'), fmtDate(s.signer.notBefore) + ' – ' + fmtDate(s.signer.notAfter));
			row(t('sigFpCert'), s.fpCert, 'fp');
			row(t('sigFpKey'), s.fpKey, 'fp');
			const tr = isTrusted(s.fpCert);
			dl.push('<dt>' + esc(t('sigTrustRow')) + '</dt><dd>' + esc(t(tr ? 'sigTrustedState' : 'sigUntrustedState')) + ' <button type="button" class="btn mini" data-fp="'
				+ esc(s.fpCert) + '" data-name="' + esc((/CN=([^,]+)/.exec(s.signer.subject) || [, s.signer.subject])[1]) + '">' + esc(t(tr ? 'sigUntrustBtn' : 'sigTrustBtn')) + '</button></dd>');
		}
		if (s.signingTime) row(t('sigTime'), s.signingTime.toLocaleString(locale()));
		if (s.checks.length) row(t('sigRefs'), s.checks.map(c => (c.ok ? '✓ ' : '✗ ') + (c.uri || t('wholeDoc'))).join(', '));
		dl.push('</dl>');
		body.push(dl.join(''));
	}
	if (result.status === 'valid') {
		if (certWarn) {
			cls = 'warn';
			title = t('sigCertTitle');
			text = t('sigCertText');
		} else {
			const who = result.signatures.map(s => (/CN=([^,]+)/.exec(s.signer.subject) || [, s.signer.subject])[1]).join('; ');
			if (result.signatures.every(s => isTrusted(s.fpCert))) { // every signer's exact certificate is on the user's list
				title = t('sigTrustedTitle');
				text = t('sigTrustedText', { who });
			} else {
				title = t('sigValidTitle');
				text = t('sigValidText', { who });
			}
		}
		if (!(title === t('sigTrustedTitle'))) text += t('sigTrust');
	} else if (result.status === 'error') {
		cls = 'warn';
		title = t('sigErrTitle');
		text = result.signatures.map(reasonText).join(' ');
	} else {
		title = t('sigBadTitle');
		text = result.signatures.filter(s => !s.ok).map(reasonText).join(' ');
	}
	box.hidden = false;
	box.className = 'sig ' + cls;
	$('sig-title').textContent = title;
	$('sig-text').textContent = text;
	$('sig-details').hidden = false;
	$('sig-body').innerHTML = body.join('');
}

/** After the preview loads: fit the iframe height to its content and pass the theme to the document inside. */
function onFrameLoad(frame) {
	const d = frame.contentDocument;
	if (!d) return;
	d.documentElement.dataset.theme = document.documentElement.dataset.theme || 'light';
	const h = d.documentElement.scrollHeight;
	if (h) frame.style.height = h + 8 + 'px';
}

/** Banner with the ISDOC version and the validation result (state is in current.val). */
function renderValidation() {
	const box = $('val');
	const v = current && current.val;
	if (!v) { box.hidden = true; return; }
	const ver = v.version || t('valUnknownVersion');
	const repairs = (v.repairs || []).map(r => t('rep_' + r.code, { ns: r.ns || '' }));
	const s = v.schema ? v.schema.version : '';
	let cls = '', title = '', text = '';
	switch (v.status) {
		case 'checking': title = t('valChecking', { v: ver }); break;
		case 'valid':
			if (repairs.length) { cls = 'warn'; title = t('valTitleRepaired', { v: ver }); text = t('valTextRepaired', { r: repairs.join('; ') }); }
			else { cls = 'ok'; title = t('valTitleOk', { v: ver }); text = t('valTextOk', { s }); }
			break;
		case 'invalid':
			cls = 'bad';
			title = t('valTitleBad', { v: ver });
			text = t('valTextBad', { s, n: v.errors.length });
			if (repairs.length) text += ' ' + t('valTextRepaired', { r: repairs.join('; ') });
			break;
		case 'noschema': cls = 'warn'; title = t('valTitleNoSchema', { v: ver }); text = t('valTextNoSchema', { v: ver }); break;
		case 'error': cls = 'warn'; title = t('valTitleError', { v: ver }); text = v.msg || ''; break;
		case 'foreign': cls = 'bad'; title = t('valTitleForeign'); text = t('valTextForeign'); break;
		case 'broken':
			cls = 'bad';
			title = t('valTitleBroken');
			text = v.line ? t('valTextBroken', { l: v.line, m: v.msg }) : t('valTextBrokenNoLine', { m: v.msg });
			break;
	}
	if (v.schema && !v.schema.exact && (v.status === 'valid' || v.status === 'invalid')) text += ' ' + t('valNear', { v: ver, s });

	const rows = [];
	const row = (k, val) => rows.push('<dt>' + esc(k) + '</dt><dd>' + esc(val) + '</dd>');
	if (v.status !== 'foreign' && v.status !== 'broken') {
		row(t('valVersion'), ver);
		row(t('valNamespace'), v.ns || '');
		if (s) row(t('valSchema'), s);
	}
	if (repairs.length) row(t('valRepairs'), repairs.join('; '));
	let list = '';
	if (v.errors && v.errors.length) {
		const MAX = 30;
		list = '<strong>' + esc(t('valErrors', { n: v.errors.length })) + '</strong><ul>'
			+ v.errors.slice(0, MAX).map(e => '<li>' + (e.line ? '<span class="muted">' + esc(t('valLine', { l: e.line })) + ':</span> ' : '') + esc(e.message) + '</li>').join('')
			+ (v.errors.length > MAX ? '<li class="muted">' + esc(t('valMore', { n: v.errors.length - MAX })) + '</li>' : '') + '</ul>';
	}
	box.hidden = false;
	box.className = 'sig ' + cls;
	$('val-title').textContent = title;
	$('val-text').textContent = text;
	const hasDetails = rows.length || list;
	$('val-details').hidden = !hasDetails;
	$('val-body').innerHTML = (rows.length ? '<dl>' + rows.join('') + '</dl>' : '') + list;
}

/** Background validation; the result is shown if the same document is still open. */
function runValidation(cur, text) {
	validateIsdoc(text, { ns: cur.val.ns, version: cur.val.version }).then(r => {
		if (current !== cur) return;
		Object.assign(cur.val, { schema: r.schema, errors: r.errors, status: r.schema ? (r.valid ? 'valid' : 'invalid') : 'noschema' });
		renderValidation();
	}).catch(e => {
		if (current !== cur) return;
		console.error(e);
		Object.assign(cur.val, { status: 'error', msg: t('valErrorMsg', { m: e.message || String(e) }) });
		renderValidation();
	});
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function renderInvoice() {
	const frame = $('view');
	if (current.rawText !== undefined) { // file that cannot be read as XML: plain text
		frame.onload = () => onFrameLoad(frame);
		frame.srcdoc = rawHtml(current.rawText, current.rawLine);
		frame.hidden = false;
		$('print').disabled = false;
		return;
	}
	const { qrs } = current;
	const effTpl = current.forceTpl || tplId;
	const tpl = TEMPLATES.find(x => x.id === effTpl) || TEMPLATES[0];
	const doc = tpl.raw ? current.original : current.doc;
	const chosen = { spayd: $('chk-spayd').checked, epc: $('chk-epc').checked };
	let out;
	try {
		const xsl = await loadStylesheet(effTpl, invoiceLang());
		const proc = new XSLTProcessor();
		proc.importStylesheet(xsl);
		proc.setParameter(null, 'qrSpayd', chosen.spayd && qrs.spayd ? qrs.spayd : '');
		proc.setParameter(null, 'qrEpc', chosen.epc && qrs.epc ? qrs.epc : '');
		proc.setParameter(null, 'qrSpaydU', String(qrs.spaydU || 41));
		proc.setParameter(null, 'qrEpcU', String(qrs.epcU || 41));
		const si = current.sigInfo;
		if (si && $('chk-sig').checked) {
			proc.setParameter(null, 'sigBy', si.by);
			// "trusted" is printed only when every signer's certificate is on the list (same rule as the banner)
			const allTrusted = current.sig.signatures.every(s => isTrusted(s.fpCert));
			proc.setParameter(null, 'sigTime', si.time ? si.time.toLocaleString(invDict.locale || invoiceLang()) : '');
			proc.setParameter(null, 'sigCert', si.fp);
			proc.setParameter(null, 'sigHash', si.hash);
			proc.setParameter(null, 'sigTrusted', allTrusted ? 'true' : '');
		}
		out = proc.transformToDocument(doc);
		if (!out || !out.documentElement) throw new Error('empty result');
	} catch (e) {
		// Transformation failed (template error, document too complex…): the preview stays, the file is shown as text.
		console.error(e);
		showError({ tx: true, message: t('e_xslt') + ' (' + (e && e.message || e) + ')' });
		frame.onload = () => onFrameLoad(frame);
		frame.srcdoc = rawHtml(current.text || '', null);
		frame.hidden = false;
		$('print').disabled = false;
		return;
	}
	if (lastError && lastError.tx) showError(null);
	// Safety net: no scripts and no external resources are allowed in the preview.
	const csp = out.createElement('meta');
	csp.setAttribute('http-equiv', 'Content-Security-Policy');
	csp.setAttribute('content', "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
	out.head.prepend(csp);
	frame.onload = () => onFrameLoad(frame);
	frame.srcdoc = '<!doctype html>' + out.documentElement.outerHTML;
	frame.hidden = false;
	$('print').disabled = false;
}

/** Data for the signature note printed on the invoice: only for a document whose signature is valid. The hash is of the file bytes. */
async function signatureInfo(sig, raw) {
	if (!sig || sig.status !== 'valid') return null;
	const s = sig.signatures[0];
	const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map(b => b.toString(16).padStart(2, '0')).join('');
	return { by: (/CN=([^,]+)/.exec(s.signer.subject) || [, s.signer.subject])[1], time: s.signingTime, fp: s.fpCert, hash };
}

/** QR codes (the payment text contains the word "invoice" in the current language). */
function buildQrs(payment) {
	payment.msgLabel = invDict.ui_invoiceWord;
	const sp = qrDataUrl(spayd(payment));
	const qrs = { spayd: sp.url, spaydU: sp.units };
	const e = epc(payment);
	if (e) { const ep = qrDataUrl(e); qrs.epc = ep.url; qrs.epcU = ep.units; }
	return qrs;
}

function setupQr(doc) {
	const bar = $('qr');
	bar.hidden = true;
	$('opt-spayd').hidden = $('opt-epc').hidden = true;
	const qrs = {};
	let payment = null;
	try { payment = paymentInfo(doc); } catch (e) { console.warn('paymentInfo', e); }
	if (payment) {
		Object.assign(qrs, buildQrs(payment));
		$('opt-spayd').hidden = false;
		$('opt-epc').hidden = !qrs.epc;
		// Default: CZK -> Czech QR payment on, EUR -> SEPA payment on, other currency -> none (can be enabled manually).
		$('chk-spayd').checked = payment.currency === 'CZK';
		$('chk-epc').checked = payment.currency === 'EUR' && !!qrs.epc;
		bar.hidden = false;
	}
	return { payment, qrs };
}

/** Shows everything according to current (validation banner, signature, attachments, preview). */
async function showCurrent() {
	const fixed = !!(current.forceTpl || current.rawText !== undefined); // layout/language/QR options only make sense for an invoice
	$('opts').hidden = fixed;
	$('chk-sig').checked = !!current.sigInfo; // a validly signed invoice prints the signature note by default
	syncOpts();
	renderSig();
	renderValidation();
	renderAttachments();
	document.title = 'ISDOC – ' + current.fileName;
	await renderInvoice();
	syncSignBtn();
}

function renderSig() {
	if (current && current.sig) renderSignature(current.sig);
	else $('sig').hidden = true;
}

async function openFile(file) {
	showError(null);
	$('drop').hidden = true;
	try {
		const { xml, attachments, zip, mainName, raw } = await readInput(file);
		const parsed = tolerantParse(xml);
		const base = { fileName: file.name, attachments, zip, mainName, repairs: parsed.repairs || [], sig: null, payment: null, qrs: {}, text: parsed.text };
		if (parsed.error) {
			// not XML: show the text and the line with the error
			current = { ...base, rawText: parsed.text, rawLine: parsed.error.line, val: { status: 'broken', msg: parsed.error.message, line: parsed.error.line } };
		} else {
			const original = parsed.doc;
			const root = original.documentElement;
			if (root.localName !== 'Invoice' || ![NS_2013, NS_2009].includes(root.namespaceURI)) {
				// well-formed XML but not ISDOC: show the source code
				current = { ...base, doc: original, original, forceTpl: 'source', val: { status: 'foreign', repairs: parsed.repairs } };
			} else {
				// The signature is verified on the original document; a normalized copy is displayed (ISDOC 2009 -> 2013).
				const sig = await verifySignatures(original);
				const display = root.namespaceURI === NS_2013 ? original
					: new DOMParser().parseFromString(parsed.text.split(NS_2009).join(NS_2013), 'application/xml');
				current = {
					...base, doc: display, original, ...setupQr(display), sig, sigInfo: await signatureInfo(sig, raw),
					val: { status: 'checking', version: root.getAttribute('version') || '', ns: root.namespaceURI, repairs: parsed.repairs }
				};
				runValidation(current, parsed.text);
			}
		}
		await showCurrent();
	} catch (e) {
		console.error(e);
		current = null;
		showError(e);
		$('view').hidden = true;
		$('sig').hidden = $('val').hidden = $('opts').hidden = $('att').hidden = true;
		$('print').disabled = true;
		syncSignBtn();
		$('drop').hidden = false;
	}
}

/* ------------------------------ App and invoice language ------------------------------ */

/** Options that make no sense for a template working on the original XML (invoice language, QR) are hidden. */
function syncOpts() {
	const tpl = TEMPLATES.find(x => x.id === tplId) || TEMPLATES[0];
	$('inv-lang-wrap').hidden = !!tpl.raw; // the source code view has no language variants
	$('qr').hidden = !(current && (current.payment || current.sigInfo)) || !!tpl.raw;
	$('opt-sig').hidden = !(current && current.sigInfo);
}

/** Invoice language (and the dictionary for the payment text in the QR) -> re-render the invoice. */
async function refreshInvoice() {
	invDict = await getDict(invoiceLang());
	$('inv-lang').value = invoiceLang();
	if (!current) return;
	if (current.payment) current.qrs = buildQrs(current.payment);
	await renderInvoice();
}

/** Loads the app dictionary, translates the static texts and re-renders everything currently shown. */
async function applyLang() {
	dict = await getDict(appLang);
	document.documentElement.lang = appLang;
	for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
	for (const el of document.querySelectorAll('[data-i18n-attr]')) {
		for (const pair of el.dataset.i18nAttr.split(',')) {
			const [attr, key] = pair.split(':');
			el.setAttribute(attr, t(key));
		}
	}
	const desc = document.querySelector('meta[name=description]');
	if (desc) desc.content = t('description');
	// layout variant names; the switcher is visible only when there is more than one variant
	$('tpl').innerHTML = TEMPLATES.map(x => '<option value="' + x.id + '">' + esc(t('tpl_' + x.id)) + '</option>').join('');
	$('tpl').value = tplId;
	$('tpl-wrap').hidden = TEMPLATES.length < 2;
	syncOpts();
	document.title = current ? 'ISDOC – ' + current.fileName : t('title');
	if (lastError) showError(lastError.key ? new UiError(lastError.key, lastError.vars) : { message: lastError.msg, tx: lastError.tx });
	if (current) { renderSig(); renderValidation(); renderAttachments(); }
	await refreshInvoice();
}

/* ------------------------------ Theme ------------------------------ */

// Light/dark theme: the saved choice, otherwise the system preference (until the user toggles it).
const systemDark = matchMedia('(prefers-color-scheme: dark)');
function applyTheme(theme) {
	document.documentElement.dataset.theme = theme;
	const d = $('view').contentDocument;
	if (d && d.documentElement) d.documentElement.dataset.theme = theme; // source / plain-text previews follow the theme
	const meta = document.querySelector('meta[name=theme-color]');
	if (meta) meta.content = theme === 'dark' ? '#14171c' : '#1f4e8c';
}
$('theme').addEventListener('click', () => {
	const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
	store('theme', next);
	applyTheme(next);
});
systemDark.addEventListener('change', e => { if (!['light', 'dark'].includes(stored('theme'))) applyTheme(e.matches ? 'dark' : 'light'); });
applyTheme(document.documentElement.dataset.theme || (systemDark.matches ? 'dark' : 'light'));

/* ------------------------------ Events ------------------------------ */

$('file').addEventListener('change', e => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
const langList = await languageNames();
$('inv-lang').innerHTML = langList.map(([c, n]) => '<option value="' + c + '">' + esc(n) + '</option>').join('');

// App language menu: opens after a click on the globe icon.
function renderLangMenu() {
	$('langMenu').innerHTML = langList.map(([c, n]) =>
		'<button type="button" role="menuitemradio" data-code="' + c + '" aria-checked="' + (c === appLang) + '"><span>' + esc(n) + '</span><span class="code">' + c + '</span></button>').join('');
}
function setLangMenu(open) {
	$('langMenu').hidden = !open;
	$('langBtn').setAttribute('aria-expanded', String(open));
	if (open) { renderLangMenu(); ($('langMenu').querySelector('[aria-checked="true"]') || $('langMenu').firstElementChild).focus(); }
}
$('langBtn').addEventListener('click', () => setLangMenu($('langMenu').hidden));
$('langMenu').addEventListener('click', e => {
	const item = e.target.closest('[data-code]');
	if (!item) return;
	appLang = item.dataset.code;
	store('lang', appLang);
	setLangMenu(false);
	$('langBtn').focus();
	applyLang();
});
document.addEventListener('click', e => { if (!$('langMenu').hidden && !e.target.closest('.langmenu')) setLangMenu(false); });
document.addEventListener('keydown', e => {
	if ($('langMenu').hidden) return;
	const items = [...$('langMenu').querySelectorAll('button')];
	const i = items.indexOf(document.activeElement);
	if (e.key === 'Escape') { setLangMenu(false); $('langBtn').focus(); }
	else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
	else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
	else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
	else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
	else if (e.key === 'Tab') setLangMenu(false);
});
await applyLang();
$('inv-lang').addEventListener('change', () => {
	invLang = $('inv-lang').value; // for this session only, not persisted
	refreshInvoice();
});
$('tpl').addEventListener('change', () => {
	tplId = $('tpl').value;
	if (!TEMPLATES.find(x => x.id === tplId).raw) store('tpl', tplId); // the "source code" view is not persisted
	syncOpts();
	if (current) renderInvoice();
});
$('print').addEventListener('click', () => $('view').contentWindow.print());
for (const id of ['chk-spayd', 'chk-epc', 'chk-sig']) $(id).addEventListener('change', () => current && renderInvoice());

const drop = $('drop');
addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) drop.classList.remove('over'); });
addEventListener('drop', e => {
	e.preventDefault();
	drop.classList.remove('over');
	const f = e.dataTransfer.files[0];
	if (f) openFile(f);
});

// Opening a file through the OS (PWA file_handlers + launch_handler): the installed app gets the files via launchQueue.
// The viewer shows one document at a time, so the first file is opened.
if ('launchQueue' in window) {
	launchQueue.setConsumer(async params => {
		if (!params.files || !params.files.length) return;
		try { openFile(await params.files[0].getFile()); } catch (e) { console.warn('launchQueue', e); }
	});
}

// Receiving a document from another page (window.open / iframe) through postMessage. Nothing goes through a server or a URL.
//   viewer -> opener/parent: { type: 'isdoc-ready' }  (repeated until the document arrives or for a few seconds)
//   sender -> viewer:        { type: 'isdoc-file', name, file }  (file = Blob or ArrayBuffer)
//   viewer -> sender:        { type: 'isdoc-received' } or { type: 'isdoc-error', code }
// The document is as untrusted as a dropped file (sandboxed preview, no scripts), so any origin may send it, but only
// the window that opened (or embeds) the viewer.
const MAX_MESSAGE_FILE = 50 * 1024 * 1024;
const sender = window.opener || (window.parent !== window ? window.parent : null);
if (sender) {
	let received = false;
	addEventListener('message', async e => {
		const m = e.data;
		if (e.source !== sender || !m || m.type !== 'isdoc-file') return;
		const reply = msg => { try { sender.postMessage(msg, e.origin === 'null' ? '*' : e.origin); } catch { /* sender is gone */ } };
		const blob = m.file instanceof ArrayBuffer ? new Blob([m.file]) : m.file;
		if (!(blob instanceof Blob)) return reply({ type: 'isdoc-error', code: 'bad-file' });
		if (blob.size > MAX_MESSAGE_FILE) return reply({ type: 'isdoc-error', code: 'too-large' });
		received = true;
		await openFile(new File([blob], typeof m.name === 'string' && m.name ? m.name.slice(0, 200) : 'document.isdoc'));
		reply({ type: 'isdoc-received' });
	});
	const ready = () => { try { sender.postMessage({ type: 'isdoc-ready' }, '*'); } catch { /* sender is gone */ } };
	ready();
	let tries = 0;
	const timer = setInterval(() => { if (received || ++tries > 20) clearInterval(timer); else ready(); }, 500);
}

// Web Share Target: the service worker stores a POSTed file in the "shared-inbox" cache and redirects to ./?shared=1.
if (new URLSearchParams(location.search).has('shared')) {
	history.replaceState(null, '', location.pathname);
	try {
		const cache = await caches.open('shared-inbox');
		const res = await cache.match('shared-file');
		if (res) {
			const name = decodeURIComponent(res.headers.get('X-File-Name') || '') || 'document.isdoc';
			const blob = await res.blob();
			await cache.delete('shared-file');
			openFile(new File([blob], name));
		}
	} catch (e) { console.warn('shared inbox', e); }
}

/* ------------------------------ Offline and updates ------------------------------ */

let toastTimer = 0;
/** Shows a short notice; with `action` it also shows a button (e.g. Reload) and stays until dismissed. */
function showToast(textKey, action) {
	clearTimeout(toastTimer);
	$('toast-text').textContent = t(textKey);
	const btn = $('toast-action');
	btn.hidden = !action;
	if (action) { btn.textContent = t(action.labelKey); btn.onclick = action.run; }
	$('toast').hidden = false;
	if (!action) toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
}

if ('serviceWorker' in navigator) {
	let controlled = !!navigator.serviceWorker.controller; // false on the very first visit
	navigator.serviceWorker.addEventListener('message', e => {
		if (!e.data || e.data.type !== 'activated') return;
		if (!controlled) { // first install: everything is cached now
			controlled = true;
			showToast('offlineReady');
		} else if (e.data.version !== self.APP_VERSION) { // a newer app version took over while this page is open
			if (!current) location.reload(); // nothing open: update right away
			else showToast('updateReady', { labelKey: 'reload', run: () => location.reload() });
		}
	});
	navigator.serviceWorker.register('sw.js').then(reg => {
		const check = () => reg.update().catch(() => {}); // fetches sw.js and version.js; installs a new version if they changed
		check(); // update check at startup
		document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); }); // installed apps stay open for days
	}).catch(e => console.warn('SW', e));
}

/* ------------------------------ Signing ------------------------------ */

// Only a real ISDOC invoice can be signed (not a plain-text or foreign XML preview).
const signable = () => !!(current && current.rawText === undefined && !current.forceTpl);
function syncSignBtn() { $('sign').disabled = !signable(); }

let signSel = ''; // id of the selected certificate in the dialog

const signErrText = e => e && e.key ? t(e.key, e.vars) : (e && e.message) || String(e);
function showCertErr(e) {
	$('certErr').textContent = e ? signErrText(e) : '';
	$('certErr').hidden = !e;
}

/** Certificate list in the dialog: clicking one selects it, "Remove" deletes it from the browser. */
async function drawCerts() {
	const box = $('certList');
	let list = [];
	try { list = await listCertificates(); showCertErr(null); } catch (e) { showCertErr(e); }
	if (!list.some(c => c.id === signSel)) signSel = list.some(c => c.id === activeId()) ? activeId() : (list.length ? list[list.length - 1].id : '');
	box.replaceChildren();
	if (!list.length) {
		const p = document.createElement('p');
		p.className = 'muted';
		p.textContent = t('signEmpty');
		box.append(p);
	}
	const fmt = d => (d ? new Date(d).toLocaleDateString(locale()) : '');
	for (const c of list) {
		const item = document.createElement('label');
		item.className = 'cert-item' + (c.id === signSel ? ' active' : '');
		const radio = document.createElement('input');
		radio.type = 'radio';
		radio.name = 'cert';
		radio.checked = c.id === signSel;
		radio.addEventListener('change', () => { signSel = c.id; drawCerts(); });
		const text = document.createElement('div');
		text.className = 'cert-text';
		const name = document.createElement('strong');
		name.textContent = c.name;
		const detail = document.createElement('div');
		detail.className = 'muted';
		detail.textContent = (c.issuer === c.subject ? t('signSelfSigned') : c.issuer) + ' · ' + t('signValid', { from: fmt(c.notBefore), to: fmt(c.notAfter) });
		text.append(name, detail);
		const fp = document.createElement('div');
		fp.className = 'fp muted';
		fp.title = t('sigFpCert');
		text.append(fp);
		const trust = document.createElement('button');
		trust.type = 'button';
		trust.className = 'btn mini';
		fingerprint(Uint8Array.from(atob(c.certs[0]), ch => ch.charCodeAt(0))).then(v => {
			fp.textContent = v;
			const on = isTrusted(v);
			trust.textContent = t(on ? 'sigUntrustBtn' : 'sigTrustBtn');
			fp.title = t(on ? 'sigTrustedState' : 'sigUntrustedState');
			if (on) fp.textContent = '✓ ' + v;
			trust.addEventListener('click', e => { e.preventDefault(); toggleTrust(v, c.name); });
		});
		text.append(trust);
		if (c.notAfter < new Date()) {
			const x = document.createElement('div');
			x.className = 'form-error';
			x.textContent = t('signExpired');
			text.append(x);
		}
		const rm = document.createElement('button');
		rm.type = 'button';
		rm.className = 'btn';
		rm.textContent = t('signRemove');
		rm.addEventListener('click', async e => {
			e.preventDefault();
			await removeCertificate(c.id).catch(() => {});
			drawCerts();
		});
		item.append(radio, text, rm);
		box.append(item);
	}
	// A repaired document is not signed: the signature would cover text that differs from the file the user opened.
	const repaired = !!(current && current.repairs && current.repairs.length);
	if (repaired) showCertErr({ key: 'signRepaired' });
	$('signDo').disabled = !signSel || repaired;
}

async function openSignDialog() {
	if (!signable()) return;
	// A second signature would invalidate the first one (its digest covers the whole document): the existing one is replaced.
	$('signAlready').hidden = !(current.sig && current.sig.status !== 'none');
	showCertErr(null);
	await drawCerts();
	$('signDlg').showModal();
}

/** Downloads bytes/text as a file. */
function downloadBlob(blob, name) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function signAndDownload() {
	const rec = (await listCertificates().catch(() => [])).find(c => c.id === signSel);
	if (!rec || !current || (current.repairs && current.repairs.length)) return;
	$('signDo').disabled = true;
	try {
		// The file is saved as UTF-8 text, so the declared encoding must say so (the text is already decoded).
		const xml = current.text.replace(/^(\s*<\?xml[^>]*?\sencoding\s*=\s*)(["'])[\w.-]+\2/i, '$1$2UTF-8$2');
		const signed = await signXml(current.sig && current.sig.status !== 'none' ? stripSignatures(xml) : xml, rec);
		setActiveId(rec.id); // remembered as the default for the next time
		const m = /^(.*?)(\.[^.]+)?$/.exec(current.fileName);
		const name = m[1] + '-signed' + (m[2] || '.isdoc');
		if (current.zip) { // ISDOCX: the signed invoice replaces the original entry, everything else stays
			current.zip.file(current.mainName, signed);
			downloadBlob(await current.zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), name);
		} else {
			downloadBlob(new Blob([signed], { type: 'application/xml' }), name);
		}
		$('signDlg').close();
		showToast('signDone');
	} catch (e) {
		console.error(e);
		showCertErr({ key: 'signFailed', vars: { message: signErrText(e) } });
	} finally {
		drawCerts();
	}
}

$('sign').addEventListener('click', openSignDialog);
$('signCancel').addEventListener('click', () => $('signDlg').close());
$('certAdd').addEventListener('click', () => $('certFile').click());
$('certFile').addEventListener('change', async e => {
	const files = [...e.target.files];
	e.target.value = '';
	if (!files.length) return;
	try {
		signSel = (await addCertificate(await Promise.all(files.map(f => f.text())))).id; // a new certificate is selected at once
		showCertErr(null);
	} catch (err) { showCertErr(err); }
	drawCerts();
});
$('signDo').addEventListener('click', signAndDownload);
