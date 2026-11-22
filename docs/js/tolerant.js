// Tolerant XML loading: tries to repair typical defects and, failing that, returns an error with the line.
// Repairs: characters before the start of the XML (BOM, whitespace, junk), unescaped &, missing ISDOC namespace.
import { NS_2009, NS_2013 } from './validate.js';

function parse(text) {
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	const err = doc.getElementsByTagName('parsererror')[0];
	return err ? { error: errorInfo(err.textContent) } : { doc };
}

/** Line and message of the error from parsererror (Chrome and Firefox). */
function errorInfo(raw) {
	raw = raw.replace(/Below is a rendering of the page up to the first error\.?/i, '').trim();
	const chrome = /error on line (\d+) at column (\d+):\s*([^\n]*)/i.exec(raw);
	if (chrome) return { line: +chrome[1], column: +chrome[2], message: chrome[3].trim() };
	const ff = /Line Number (\d+), Column (\d+)/i.exec(raw);
	const first = raw.split('\n').find(l => l.trim() && !/^This page contains/i.test(l)) || raw;
	return { line: ff ? +ff[1] : null, column: ff ? +ff[2] : null, message: first.replace(/^XML Parsing Error:\s*/i, '').trim().slice(0, 200) };
}

/**
 * @returns {{doc?: Document, text: string, repairs: {code: string, ns?: string}[], error?: {line, column, message}}}
 */
export function tolerantParse(text) {
	const repairs = [];
	let t = text;
	let r = parse(t);
	const firstError = r.error;

	if (!r.doc) {
		const i = t.indexOf('<');
		if (i > 0) { t = t.slice(i); repairs.push({ code: 'stripJunk' }); r = parse(t); }
	}
	if (!r.doc) {
		const fixed = t.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
		if (fixed !== t) { t = fixed; repairs.push({ code: 'ampersand' }); r = parse(t); }
	}
	if (!r.doc) return { text: text, repairs: [], error: firstError || r.error };

	// Invoice without a namespace: add it according to the version (5.x -> 2009, otherwise 2013).
	const root = r.doc.documentElement;
	if (root.localName === 'Invoice' && !root.namespaceURI) {
		const ns = /^5/.test(root.getAttribute('version') || '') ? NS_2009 : NS_2013;
		const t2 = t.replace(/<Invoice(?=[\s>\/])/, '<Invoice xmlns="' + ns + '"');
		const r2 = parse(t2);
		if (r2.doc) { t = t2; r = r2; repairs.push({ code: 'namespace', ns }); }
	}
	return { doc: r.doc, text: t, repairs };
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML with the plain text of a file (numbered lines, the error line highlighted). For a file that cannot be read as XML. */
export function rawHtml(text, errLine) {
	const lines = text.split(/\r\n|\r|\n/).map((l, i) =>
		'<div class="l' + (i + 1 === errLine ? ' e' : '') + '">' + esc(l) + '</div>').join('');
	return '<!doctype html><html><head><meta charset="utf-8">'
		+ '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">'
		+ '<style>:root{--bg:#fff;--fg:#1f2328;--ln:#8c959f;--line:#d0d7de;--err:#ffebe9}'
		+ ':root[data-theme="dark"]{--bg:#0d1117;--fg:#e6edf3;--ln:#6e7681;--line:#30363d;--err:#5a1d1d}'
		+ '@media (prefers-color-scheme:dark){:root:not([data-theme]){--bg:#0d1117;--fg:#e6edf3;--ln:#6e7681;--line:#30363d;--err:#5a1d1d}}'
		+ 'html,body{margin:0;background:var(--bg);color:var(--fg)}'
		+ '.code{counter-reset:ln;padding:10px 0;font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}'
		+ '.l{counter-increment:ln;white-space:pre-wrap;word-break:break-all;padding:0 12px 0 56px;position:relative;min-height:1.55em}'
		+ '.l::before{content:counter(ln);position:absolute;left:0;width:44px;text-align:right;color:var(--ln);border-right:1px solid var(--line);padding-right:6px}'
		+ '.e{background:var(--err)}</style></head><body><div class="code">' + lines + '</div></body></html>';
}
