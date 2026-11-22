// ISDOC version detection and XSD validation (libxml2 compiled to WebAssembly – vendor/xmllint).
// Schemas live in schemas/. To add a version: put schemas/isdoc-invoice-X.Y.Z.xsd there and add a line to SCHEMAS.
export const NS_2009 = 'http://isdoc.cz/namespace/invoice'; // ISDOC 5.x
export const NS_2013 = 'http://isdoc.cz/namespace/2013';    // ISDOC 6.x

// Schemas 5.1, 5.2 and 5.2.1 are missing on purpose: their headers contain no permission to redistribute (see THIRD_PARTY_NOTICES.md).
export const SCHEMAS = [
	{ version: '5.2.2', ns: NS_2009, file: 'schemas/isdoc-invoice-5.2.2.xsd' },
	{ version: '5.2.3', ns: NS_2009, file: 'schemas/isdoc-invoice-5.2.3.xsd' },
	{ version: '5.3', ns: NS_2009, file: 'schemas/isdoc-invoice-5.3.xsd' },
	{ version: '5.3.1', ns: NS_2009, file: 'schemas/isdoc-invoice-5.3.1.xsd' },
	{ version: '6.0.1', ns: NS_2013, file: 'schemas/isdoc-invoice-6.0.1.xsd' },
	{ version: '6.0.2', ns: NS_2013, file: 'schemas/isdoc-invoice-6.0.2.xsd' }
];

const parts = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
export function cmpVersion(a, b) {
	const x = parts(a), y = parts(b);
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		const d = (x[i] || 0) - (y[i] || 0);
		if (d) return d;
	}
	return 0;
}

/** Picks a schema: exact version match, otherwise the highest lower one, otherwise the lowest higher one (in the same namespace). */
export function pickSchema(ns, version) {
	const list = SCHEMAS.filter(s => s.ns === ns).sort((a, b) => cmpVersion(a.version, b.version));
	if (!list.length) return null;
	if (!version) return { ...list[list.length - 1], exact: false };
	const exact = list.find(s => cmpVersion(s.version, version) === 0);
	if (exact) return { ...exact, exact: true };
	const lower = list.filter(s => cmpVersion(s.version, version) < 0);
	return { ...(lower.length ? lower[lower.length - 1] : list[0]), exact: false };
}

const schemaText = new Map();

/**
 * Validates XML text. Returns { schema, valid, errors:[{line,message}] }; throws if the validation itself fails.
 * The encoding declaration is rewritten to UTF-8 because the text is already decoded (otherwise xmllint would read the wrong charset).
 */
export async function validateIsdoc(text, { ns, version }) {
	const schema = pickSchema(ns, version);
	if (!schema) return { schema: null, valid: null, errors: [] };
	if (!schemaText.has(schema.file)) {
		const res = await fetch(schema.file);
		if (!res.ok) throw new Error('Could not load schema ' + schema.file);
		schemaText.set(schema.file, await res.text());
	}
	const { validateXML } = await import('../vendor/xmllint/index-browser.mjs');
	const xml = text.replace(/^(\s*)<\?xml[^?]*\?>/, '$1<?xml version="1.0" encoding="UTF-8"?>');
	const res = await validateXML({
		xml: [{ fileName: 'doc.xml', contents: xml }],
		schema: [{ fileName: 'schema.xsd', contents: schemaText.get(schema.file) }]
	});
	const errors = res.errors.map(e => ({
		line: e.loc ? e.loc.lineNumber : null,
		message: e.message.replace(/^element [^:]*: Schemas validity error : /i, '').replace(/^Schemas validity error : /i, '')
	}));
	return { schema, valid: res.valid, errors };
}
