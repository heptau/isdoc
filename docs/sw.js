// Offline support and updates of the app shell.
//  - install:  precache every file (bypassing the HTTP cache) and activate at once
//  - activate: delete old caches, take control of open pages and tell them an update happened
//  - fetch:    network first (always revalidated, so a new version is picked up on the next load);
//              the cache is the fallback when offline or when the network is slow
importScripts('js/version.js'); // defines APP_VERSION (the page loads the same file)

const VERSION = self.APP_VERSION;
const NETWORK_TIMEOUT = 6000; // ms; after that the cached copy is served if there is one
const SCHEMA_FILES = ['5.2.2', '5.2.3', '5.3', '5.3.1', '6.0.1', '6.0.2'].map(v => 'schemas/isdoc-invoice-' + v + '.xsd');
const ASSETS = [
	'./', 'index.html', 'style.css', 'manifest.webmanifest', 'integrate.html',
	'templates/standard.xsl', 'templates/uol.xsl', 'templates/source.xsl',
	'js/version.js', 'js/app.js', 'js/lang.js', 'js/templates.js', 'js/dsig.js', 'js/sign.js', 'js/payment.js', 'js/validate.js', 'js/tolerant.js', 'js/xslt-config.js',
	...['cs', 'sk', 'en', 'es', 'de', 'fr', 'it', 'pt'].map(c => 'lang/' + c + '.json'),
	'vendor/jszip.min.js', 'vendor/qrcode.js', 'vendor/xslt-polyfill.min.js',
	'vendor/xmllint/index-browser.mjs', 'vendor/xmllint/xmllint-browser.mjs', 'vendor/xmllint/xmllint.wasm',
	...SCHEMA_FILES,
	'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
	e.waitUntil(caches.open(VERSION)
		.then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
		.then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
	e.waitUntil((async () => {
		for (const key of await caches.keys()) if (key !== VERSION && key !== 'shared-inbox') await caches.delete(key);
		await self.clients.claim();
		for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'activated', version: VERSION });
	})());
});

self.addEventListener('fetch', e => {
	const req = e.request;
	if (req.method === 'POST' && new URL(req.url).origin === location.origin && new URL(req.url).pathname.endsWith('/share-target')) {
		e.respondWith(receiveShared(req));
		return;
	}
	if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
	e.respondWith(networkFirst(req));
});

// Web Share Target (POST multipart): keep the file for the page and redirect to it; the page reads and deletes it.
async function receiveShared(req) {
	try {
		const file = (await req.formData()).get('file');
		if (file && typeof file !== 'string') {
			const cache = await caches.open('shared-inbox');
			await cache.put('shared-file', new Response(file, { headers: { 'X-File-Name': encodeURIComponent(file.name || '') } }));
		}
	} catch (err) { console.warn('share-target', err); }
	return Response.redirect('./?shared=1', 303);
}

async function networkFirst(req) {
	const cache = await caches.open(VERSION);
	const cached = async () => (await cache.match(req, { ignoreSearch: true }))
		|| (req.mode === 'navigate' ? (await cache.match('index.html')) || (await cache.match('./')) : undefined);
	try {
		const network = fetch(req, { cache: 'no-cache' }); // revalidate with the server, never trust the HTTP cache
		network.catch(() => {}); // no unhandled rejection when the timeout wins
		const res = await Promise.race([network, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT))]);
		if (res.status === 200) cache.put(req, res.clone());
		return res;
	} catch {
		return (await cached()) || Response.error();
	}
}
