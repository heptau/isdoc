// Offline cache of the app shell. Bump VERSION when files change.
const VERSION = 'isdoc-v16';
const SCHEMA_FILES = ['5.2.2','5.2.3','5.3','5.3.1','6.0.1','6.0.2'].map(v => 'schemas/isdoc-invoice-' + v + '.xsd');
const ASSETS = [
	'./', 'index.html', 'style.css', 'templates/standard.xsl', 'templates/uol.xsl', 'templates/source.xsl', 'manifest.webmanifest',
	'js/app.js', 'js/lang.js', 'js/templates.js', 'lang/cs.json', 'lang/sk.json', 'lang/en.json', 'lang/es.json', 'lang/de.json', 'lang/fr.json', 'lang/it.json', 'lang/pt.json', 'js/dsig.js', 'js/payment.js', 'js/validate.js', 'js/tolerant.js', 'vendor/xmllint/index-browser.mjs', 'vendor/xmllint/xmllint-browser.mjs', 'vendor/xmllint/xmllint.wasm', ...SCHEMA_FILES,
	'js/xslt-config.js', 'vendor/jszip.min.js', 'vendor/qrcode.js', 'vendor/xslt-polyfill.min.js',
	'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', e => {
	e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
	e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
		.then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
	if (e.request.method !== 'GET') return;
	// Network first (current version), cache on failure – so the app works offline.
	e.respondWith(fetch(e.request).then(res => {
		if (res.ok && new URL(e.request.url).origin === location.origin) {
			const copy = res.clone();
			caches.open(VERSION).then(c => c.put(e.request, copy));
		}
		return res;
	}).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
