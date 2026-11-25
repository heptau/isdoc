// Single source of truth for the app version. Loaded by index.html and imported by the service worker (importScripts).
// Bump it whenever any file of the app changes: installed copies then re-download the app and offer a reload.
self.APP_VERSION = 'isdoc-v34';
