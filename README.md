# ISDOC Viewer

A small installable web app (PWA) that displays [ISDOC](https://isdoc.cz/) invoices (`.isdoc`, `.isdocx`) using
XSLT, checks their electronic signature and validity, and offers a QR code for paying the invoice.
Everything runs on your device (in the browser, or as an installed app) – files are never uploaded anywhere.

Live site: <https://isdoc.80.cz/> · Source: <https://github.com/heptau/isdoc>

## Features

- **Opens** `.isdoc` and `.isdocx` (attachments of an ISDOCX archive can be downloaded). Drag & drop, a file
  picker, or the OS file handler once the app is installed.
- **XSLT layouts** (more can be added): *Standard*, *UOL IIS* (the look of the UOL IIS invoice, laid out to fit the
  Czech window envelope) and *Source code* (indented, syntax‑highlighted XML).
- **8 languages** for both the app and the invoice: Czech, Slovak, English, Spanish, German, French, Italian,
  Portuguese. The invoice language is independent of the app language (it follows it until you change it).
- **Signature check** (XMLDSig, enveloped): reference digests and the signature value are verified with WebCrypto
  (RSA‑SHA1/256/384/512, ECDSA); signer, issuer, validity, signing time and the SHA‑256 fingerprints of the certificate and its public key are shown
  (the fingerprint tells apart a certificate from a look‑alike with the same name; the *Sign* dialog shows the same value).
  Trust in the certificate chain (CA) and revocation are **not** checked.
- **Trusted certificates**: a button next to the fingerprint adds the certificate (by its SHA‑256 fingerprint) to a
  list kept in this browser. Documents signed by a listed certificate are marked *valid and trusted*; the list is
  per browser and is not a CA check.
- **Signature note on the printout**: for a validly signed invoice the *Show:* bar offers *Signature* (on by default). It
  prints the signer, signing time, the certificate's SHA‑256 fingerprint and the SHA‑256 hash of the file (the
  `.isdoc`, for ISDOCX the one inside), so a paper copy can be matched to the electronic original
  (`shasum -a 256 invoice.isdoc`). Only the first signature is shown; an invalid signature prints nothing.
- **Signing**: the *Sign* button next to *Print* signs the loaded ISDOC / ISDOCX (enveloped XMLDSig, exclusive C14N,
  SHA‑256, RSA or ECDSA) and downloads it as `<name>-signed.isdoc(x)`. The dialog lists stored certificates and lets
  you add one from PEM files (certificate + unencrypted private key). The key is imported as a non‑extractable
  WebCrypto key and kept in this browser's IndexedDB; it never leaves the device. Compatible with the UOL client
  (`docs/js/sign.js` is a port of its `client/js/sign.js`: same record format and signature layout). Signing an already signed
  document (the dialog warns) replaces the existing signature with the new one.
- **ISDOC version and validation** against the official XSD schemas (libxml2 compiled to WebAssembly), with the
  list of errors and line numbers.
- **Lenient display of invalid documents**: schema‑invalid invoices are still rendered; typical defects (junk before
  the XML, unescaped `&`, missing namespace) are repaired automatically and reported; well‑formed non‑ISDOC XML is
  shown as source code; broken XML is shown as numbered text with the faulty line highlighted.
- **QR payment**: Czech QR payment (SPAYD) and SEPA/EPC QR for any currency. Enabled by default for CZK (Czech QR)
  and EUR (SEPA); both can be switched on manually. In the *UOL IIS* layout the codes are framed according to the
  graphic manual of the Czech Banking Association (qr-platba.cz).
- **Light / dark theme** switch (remembered; follows the system preference until you change it) and links to sponsor
  the project and to star it on GitHub.
- **Works offline** after the first visit (service worker precaches the whole app). On every start it checks for a new
  version and installs it; if no document is open the app reloads itself, otherwise it shows a *Reload* button.

## Opening files from the system

When the app is **installed** (Chrome/Edge: *Install* in the address bar or menu; works on Windows, macOS, Linux and
ChromeOS), it registers itself as a handler for `.isdoc` and `.isdocx` files (`file_handlers` in the manifest). Then
*Open with → ISDOC Viewer* works in the file manager, and you can make it the default app for these extensions in the
OS file settings. A file opened this way goes to the already running window (`launch_handler`). Safari, Firefox and
mobile browsers do not support file handlers; there, use the *Open* button or drag & drop.

## Run locally

There is no build step. Serve the `docs/` folder with any static web server, e.g.:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs
```

then open <http://localhost:8765>. A service worker and installation need HTTPS or `localhost`.

## Publish with GitHub Pages

The site is the `docs/` folder: in the repository settings choose **Pages → Deploy from a branch → `main` / `/docs`**.
The custom domain `isdoc.80.cz` is set by `docs/CNAME`; point a DNS `CNAME` record of `isdoc.80.cz` to `heptau.github.io`.
All paths in the app are relative, so it also works from a sub-path such as `https://<user>.github.io/isdoc/`.
`docs/llms.txt` describes the site for LLMs ([llmstxt.org](https://llmstxt.org/) format); keep it in sync with the features.

## Project layout

```
docs/                      the whole web app (what GitHub Pages serves)
  index.html, style.css, manifest.webmanifest, sw.js
  js/
    app.js                 UI, file loading, banners, rendering
    dsig.js                C14N + XMLDSig verification (WebCrypto)
    validate.js            ISDOC version detection, XSD validation
    tolerant.js            lenient XML loading and repairs
    payment.js             IBAN, SPAYD, EPC, QR code
    lang.js, templates.js  languages and layout registry
  lang/*.json              texts of the app (ui_*) and of the invoices, number/date formats
  templates/*.xsl          XSLT 1.0 layouts with {{key}} placeholders
  schemas/                 ISDOC XSD schemas
  vendor/                  third-party libraries (see THIRD_PARTY_NOTICES.md)
  samples/                 fictional example invoices (unsigned, signed, tampered, ISDOCX, EUR)
LICENSE, THIRD_PARTY_NOTICES.md, AGENTS.md
```

## Extending

- **New language** – add `docs/lang/xx.json` with the same keys as `cs.json` and put the code into `LANGS`
  in `docs/js/lang.js`.
- **New layout** – add `docs/templates/<id>.xsl` (use the same `{{key}}` placeholders; texts and formats stay in
  `lang/*.json`), register it in `docs/js/templates.js` and add a translated name `ui_tpl_<id>` to every
  `lang/*.json`. The layout switcher appears automatically.
- **New ISDOC schema version** – put `docs/schemas/isdoc-invoice-X.Y.Z.xsd` there, add a line to `SCHEMAS` in
  `docs/js/validate.js` and the file name to `SCHEMA_FILES` in `docs/sw.js`. Only add schemas whose header
  grants permission to redistribute (see THIRD_PARTY_NOTICES.md).
- After changing any file of the app, bump `APP_VERSION` in `docs/js/version.js` (shared by the page and the service worker)
  so installed copies update and offer a reload.

## Notes and limitations

- Native XSLT is being removed from browsers (Chrome), so the app ships an XSLT polyfill (libxslt in
  WebAssembly) that is used only where `XSLTProcessor` is missing.
- The preview is rendered in a sandboxed iframe without scripts and with a strict Content‑Security‑Policy, so an
  invoice cannot run code or load remote resources (the supplier logo from ISDOC extensions is deliberately not loaded).
- ECDSA signatures are implemented but were not tested against an independent signer.
- ISDOC schemas 5.1, 5.2 and 5.2.1 are not included (no permission to redistribute); such documents are validated
  against the closest available schema.

## License

The project's own code is released under the [MIT License](LICENSE). Third‑party components in `docs/vendor/` and
`docs/schemas/` keep their own licenses – see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). In particular, the
ISDOC schemas are **not** covered by the MIT license.
