import { verifySignatures } from './dsig.js';
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
	if (!isZip) return { xml: decodeXml(bytes), attachments: [] };

	const zip = await JSZip.loadAsync(bytes);
	const entries = Object.values(zip.files).filter(f => !f.dir);
	const main = entries.find(f => /\.isdoc$/i.test(f.name)) || entries.find(f => /\.xml$/i.test(f.name) && !/manifest/i.test(f.name));
	if (!main) throw new UiError('e_noIsdoc');
	const xml = decodeXml(await main.async('uint8array'));
	const attachments = entries.filter(f => f !== main && !/manifest\.xml$/i.test(f.name)).map(f => ({ name: f.name, entry: f }));
	return { xml, attachments };
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
		const row = (k, v) => dl.push('<dt>' + k + '</dt><dd>' + esc(v) + '</dd>');
		row(t('sigStatus'), s.ok ? t('sigOkState') : t(s.error ? 'sigErrState' : 'sigBadState', { r: reasonText(s) }));
		if (s.signer) {
			row(t('sigSigner'), s.signer.subject);
			row(t('sigIssuer'), s.signer.issuer);
			row(t('sigValidity'), fmtDate(s.signer.notBefore) + ' – ' + fmtDate(s.signer.notAfter));
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
			title = t('sigValidTitle');
			text = t('sigValidText', { who: result.signatures.map(s => (/CN=([^,]+)/.exec(s.signer.subject) || [, s.signer.subject])[1]).join('; ') });
		}
		text += t('sigTrust');
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
		frame.onload = () => { const h = frame.contentDocument.documentElement.scrollHeight; if (h) frame.style.height = h + 8 + 'px'; };
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
		out = proc.transformToDocument(doc);
		if (!out || !out.documentElement) throw new Error('empty result');
	} catch (e) {
		// Transformation failed (template error, document too complex…): the preview stays, the file is shown as text.
		console.error(e);
		showError({ tx: true, message: t('e_xslt') + ' (' + (e && e.message || e) + ')' });
		frame.onload = () => { const h = frame.contentDocument.documentElement.scrollHeight; if (h) frame.style.height = h + 8 + 'px'; };
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
	frame.onload = () => {
		const h = frame.contentDocument && frame.contentDocument.documentElement.scrollHeight;
		if (h) frame.style.height = h + 8 + 'px';
	};
	frame.srcdoc = '<!doctype html>' + out.documentElement.outerHTML;
	frame.hidden = false;
	$('print').disabled = false;
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
	syncOpts();
	renderSig();
	renderValidation();
	renderAttachments();
	document.title = 'ISDOC – ' + current.fileName;
	await renderInvoice();
}

function renderSig() {
	if (current && current.sig) renderSignature(current.sig);
	else $('sig').hidden = true;
}

async function openFile(file) {
	showError(null);
	$('drop').hidden = true;
	try {
		const { xml, attachments } = await readInput(file);
		const parsed = tolerantParse(xml);
		const base = { fileName: file.name, attachments, sig: null, payment: null, qrs: {}, text: parsed.text };
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
					...base, doc: display, original, ...setupQr(display), sig,
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
		$('drop').hidden = false;
	}
}

/* ------------------------------ App and invoice language ------------------------------ */

/** Options that make no sense for a template working on the original XML (invoice language, QR) are hidden. */
function syncOpts() {
	const tpl = TEMPLATES.find(x => x.id === tplId) || TEMPLATES[0];
	$('inv-lang-wrap').hidden = !!tpl.raw; // the source code view has no language variants
	$('qr').hidden = !(current && current.payment) || !!tpl.raw;
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

/* ------------------------------ Events ------------------------------ */

$('file').addEventListener('change', e => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
const langList = await languageNames();
const langOptions = langList.map(([c, n]) => '<option value="' + c + '">' + esc(n) + '</option>').join('');
$('lang').innerHTML = $('inv-lang').innerHTML = langOptions;
$('lang').value = appLang;
await applyLang();
$('lang').addEventListener('change', () => {
	appLang = $('lang').value;
	store('lang', appLang);
	applyLang();
});
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
for (const id of ['chk-spayd', 'chk-epc']) $(id).addEventListener('change', () => current && renderInvoice());

const drop = $('drop');
addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) drop.classList.remove('over'); });
addEventListener('drop', e => {
	e.preventDefault();
	drop.classList.remove('over');
	const f = e.dataTransfer.files[0];
	if (f) openFile(f);
});

// Opening a file through the OS (PWA file_handlers)
if ('launchQueue' in window) {
	launchQueue.setConsumer(async params => {
		if (params.files && params.files.length) openFile(await params.files[0].getFile());
	});
}

if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
}
