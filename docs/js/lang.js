// Language variants of a template: the template contains {{key}} placeholders that are replaced with values from lang/<code>.json.
// New language = new file lang/xx.json (same keys as cs.json) + add the code to LANGS.
export const LANGS = ['cs', 'sk', 'en', 'es', 'de', 'fr', 'it', 'pt'];
export const DEFAULT_LANG = 'cs';

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

import { TEMPLATES, DEFAULT_TEMPLATE } from './templates.js';

const templates = new Map(); // id -> template text
const cache = new Map(); // 'id/code' -> XSLT Document

/** Picks the language from the browser, otherwise the default. */
export function detectLang() {
	for (const l of navigator.languages || [navigator.language]) {
		const c = (l || '').slice(0, 2).toLowerCase();
		if (LANGS.includes(c)) return c;
	}
	return DEFAULT_LANG;
}

export async function languageNames() {
	return Promise.all(LANGS.map(async c => [c, (await loadDict(c)).name]));
}

const dicts = new Map();
export const getDict = code => loadDict(code);
async function loadDict(code) {
	if (!dicts.has(code)) {
		const res = await fetch('lang/' + code + '.json');
		if (!res.ok) throw new Error('Missing language file lang/' + code + '.json');
		dicts.set(code, await res.json());
	}
	return dicts.get(code);
}

/** Returns the XSLT document for the given layout variant and invoice language. */
export async function loadStylesheet(templateId, code) {
	if (!LANGS.includes(code)) code = DEFAULT_LANG;
	const tpl = TEMPLATES.find(t => t.id === templateId) || TEMPLATES.find(t => t.id === DEFAULT_TEMPLATE);
	const key = tpl.id + '/' + code;
	if (cache.has(key)) return cache.get(key);
	if (!templates.has(tpl.id)) templates.set(tpl.id, await (await fetch(tpl.file)).text());
	const template = templates.get(tpl.id);
	const d = await loadDict(code);
	const dec = d.decimalSep, grp = d.groupSep;
	const values = {
		...d,
		pMoney: '#' + grp + '##0' + dec + '00',
		pQty: '#' + grp + '##0' + dec + '######',
		pRate: '#' + grp + '##0' + dec + '000',
		pUnit: '#' + grp + '##0' + dec + '00#',
		pPct: '0' + dec + '##'
	};
	const missing = new Set();
	const text = template.replace(/\{\{(\w+)\}\}/g, (m, k) => {
		if (!(k in values)) { missing.add(k); return m; }
		return xmlEsc(values[k]);
	});
	if (missing.size) console.warn('Language', code, '– missing keys:', [...missing]);
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	const err = doc.getElementsByTagName('parsererror')[0];
	if (err) throw new Error('Template for language ' + code + ' is not valid XML: ' + err.textContent.slice(0, 200));
	cache.set(key, doc);
	return doc;
}
