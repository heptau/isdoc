// Native XSLT is disappearing from browsers (Chrome is removing it) – the polyfill (libxslt in WASM) is
// installed only where window.XSLTProcessor is missing.
window.xsltUsePolyfillOnlyIfNeeded = true;
window.xsltDontAutoloadXmlDocs = true;
window.xsltPolyfillQuiet = true;
