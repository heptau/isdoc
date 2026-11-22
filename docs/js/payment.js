// Extracts payment data from ISDOC and builds the QR payment (SPAYD / EPC).
export const NS = 'http://isdoc.cz/namespace/2013';

const text = (el, path) => {
	let cur = el;
	for (const name of path) {
		if (!cur) return '';
		cur = [...cur.children].find(c => c.localName === name) || null;
	}
	return cur ? cur.textContent.trim() : '';
};

const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** IBAN from a Czech account number (prefix-number/bank code). */
export function czIban(account, bankCode) {
	const m = /^(?:(\d{1,6})-)?(\d{2,10})$/.exec((account || '').replace(/\s/g, ''));
	if (!m || !/^\d{4}$/.test(bankCode || '')) return '';
	const bban = bankCode + (m[1] || '').padStart(6, '0') + m[2].padStart(10, '0');
	const rem = BigInt(bban + '123500') % 97n; // CZ -> 12 35, check digits 00
	return 'CZ' + String(98n - rem).padStart(2, '0') + bban;
}

export function ibanValid(iban) {
	const s = (iban || '').replace(/\s/g, '').toUpperCase();
	if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
	const num = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
	return BigInt(num) % 97n === 1n;
}

/** Extracts everything needed for payment from the Invoice. Returns null if there is nothing to pay. */
export function paymentInfo(doc) {
	const inv = doc.documentElement;
	if (inv.localName !== 'Invoice') return null;
	const local = text(inv, ['LocalCurrencyCode']);
	const foreign = text(inv, ['ForeignCurrencyCode']);
	const useForeign = foreign && foreign !== local;
	const total = [...inv.children].find(c => c.localName === 'LegalMonetaryTotal');
	let amount = parseFloat(text(total, [useForeign ? 'PayableAmountCurr' : 'PayableAmount']));
	const payments = [...inv.getElementsByTagNameNS(NS, 'Payment')];
	const pay = payments.find(p => text(p, ['PaymentMeansCode']) === '42') || payments[0];
	if (!pay) return null;
	if (!(amount > 0)) amount = parseFloat(text(pay, ['PaidAmount']));
	if (!(amount > 0)) return null;

	const d = k => text(pay, ['Details', k]);
	let iban = d('IBAN').replace(/\s/g, '').toUpperCase();
	if (!iban) iban = czIban(d('ID'), d('BankCode'));
	if (!iban || !ibanValid(iban)) return null;

	const party = [...inv.children].find(c => c.localName === 'AccountingSupplierParty');
	return {
		amount,
		currency: useForeign ? foreign : local,
		iban,
		bic: d('BIC').toUpperCase(),
		vs: d('VariableSymbol') || text(inv, ['ID']).replace(/\D/g, '').slice(0, 10),
		ks: d('ConstantSymbol'),
		ss: d('SpecificSymbol'),
		invoiceId: text(inv, ['ID']),
		supplier: text(party, ['Party', 'PartyName', 'Name'])
	};
}

/** SPAYD 1.0 – the Czech QR payment. */
export function spayd(p) {
	const clean = (s, n) => fold(s).replace(/[^A-Za-z0-9 .,:/()+\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
	const f = [
		['ACC', p.iban + (p.bic ? '+' + p.bic : '')],
		['AM', p.amount.toFixed(2)],
		['CC', p.currency],
		['MSG', clean((p.msgLabel || 'Invoice') + ' ' + p.invoiceId, 60)],
		['RN', clean(p.supplier, 35)]
	];
	if (/^\d{1,10}$/.test(p.vs)) f.push(['X-VS', p.vs]);
	if (/^\d{1,10}$/.test(p.ks)) f.push(['X-KS', p.ks]);
	if (/^\d{1,10}$/.test(p.ss)) f.push(['X-SS', p.ss]);
	f.sort((a, b) => a[0].localeCompare(b[0]));
	return 'SPD*1.0*' + f.filter(([, v]) => v).map(([k, v]) => k + ':' + v.replace(/\*/g, '%2A')).join('*');
}

/** EPC QR (SEPA Credit Transfer). Officially EUR only, but the currency code in the amount field can be used for any currency. */
export function epc(p) {
	if (!/^[A-Z]{3}$/.test(p.currency) || p.amount > 999999999.99) return null;
	const a = (s, n) => fold(s).replace(/[\r\n]+/g, ' ').trim().slice(0, n);
	return [
		'BCD', '002', '1', 'SCT',
		p.bic, a(p.supplier || 'Payee', 70), p.iban,
		p.currency + p.amount.toFixed(2),
		'', '',
		a((p.msgLabel || 'Invoice') + ' ' + p.invoiceId + (p.vs ? ' VS ' + p.vs : ''), 140)
	].join('\n');
}

/**
 * Text -> { url, units }: data: URL of an SVG with the QR code (needs the global qrcode from vendor/qrcode.js) and the image width
 * in "dots" T (modules + a 4T quiet zone on each side) – templates use it to compute the frame dimensions.
 */
export function qrDataUrl(data) {
	const qr = window.qrcode(0, 'M');
	qr.addData(data);
	qr.make();
	const svg = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
	return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), units: qr.getModuleCount() + 8 };
}
