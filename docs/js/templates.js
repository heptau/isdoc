// Registry of invoice layout variants. New variant = new file templates/<id>.xsl (same {{keys}} as standard.xsl,
// texts and formats stay in lang/*.json) + an entry here and a translated name in lang/*.json under the key ui_tpl_<id>.
export const TEMPLATES = [
	{ id: 'standard', file: 'templates/standard.xsl' },
	{ id: 'uol', file: 'templates/uol.xsl' },
	// raw: the template gets the original XML (not the normalized copy) and uses neither the invoice language nor the QR
	{ id: 'source', file: 'templates/source.xsl', raw: true }
];
export const DEFAULT_TEMPLATE = 'standard';
