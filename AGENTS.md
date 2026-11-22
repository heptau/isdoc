# AGENTS.md

Notes for AI coding agents (and humans) working on this repository. Claude Code reads `CLAUDE.md`, which imports this file.

## What this is
A no-build static PWA that renders ISDOC / ISDOCX invoices with XSLT, verifies signatures, validates against the ISDOC XSD
schemas and offers QR payments. The whole site is the `docs/` folder (GitHub Pages). See `README.md` for features.

## Run and test
- Serve with `python3 -m http.server 8765 --directory docs` and open `http://localhost:8765`.
- There is no automated test suite. Verify changes in a real browser. Useful checks used so far:
  render the samples in `docs/samples/` in every template x language; render a "worst case" invoice (long names, foreign
  currency, discounts, delivery address, longest document type) and look for overlapping text / text outside boxes;
  round-trip the *Source code* view (re-parse the displayed text and compare canonical forms with the original).
- After editing static files the browser may keep a stale copy (HTTP cache and the service worker). Bump `VERSION` in
  `docs/sw.js`, or hard-reload / unregister the service worker while testing.

## Conventions
- Documentation and all code comments are in **English**. Texts shown to users live in `docs/lang/*.json`
  (`ui_*` keys = the app, other keys = invoice templates). Never hard-code user-visible Czech/English strings in JS or XSL.
- No external runtime requests: everything the app needs is in `docs/` (vendored libraries, schemas). The invoice preview
  is a sandboxed iframe (`allow-same-origin allow-modals`, no scripts) with a CSP, and must not load remote resources.
- All paths are relative so the site works from a sub-path (`https://<user>.github.io/isdoc/`). The production URL is
  `https://isdoc.80.cz/` (`docs/CNAME`; do not delete that file or Pages loses the custom domain).
- `docs/llms.txt` describes the site for LLMs (llmstxt.org format). Update it when features, sample files or URLs change.
- Adding a language / layout / schema: see "Extending" in `README.md`. Keep every `lang/*.json` in sync (same keys).

## Gotchas learned the hard way
- **XSLT 1.0 only.** Chrome removed native XSLT; the app uses `docs/vendor/xslt-polyfill.min.js` (libxslt in WASM).
  Avoid deep recursion over occurrences (it overflowed the stack at ~1000 iterations); halve long strings instead
  (see `rep` in `templates/source.xsl`).
- Templates are text with `{{key}}` placeholders substituted in `docs/js/lang.js`; the result must be well-formed XML.
  Number/date formats come from the language file (`decimalSep`, `groupSep`, `dateOrder`, ...).
- **Check element names against the schema.** A past bug read `PaidDepositAmount`, which does not exist
  (`PaidDepositsAmount` is correct). `DocumentType` values: 1 invoice, 2 credit note, 3 debit note, 4 proforma (no VAT),
  5 tax document for a received payment, 6 its corrective document, 7 simplified tax document.
- ISDOC 5.x uses the namespace `http://isdoc.cz/namespace/invoice`, 6.x uses `http://isdoc.cz/namespace/2013`.
  The signature is verified on the original document; templates get a copy normalized to the 2013 namespace
  (except templates marked `raw` in `docs/js/templates.js`).
- In the *UOL IIS* layout the customer box must stay where it is (120 px from the top, 50 % width, right aligned) - it is
  the window of a Czech window envelope. Do not use fixed offsets for text that changes length between languages;
  use flex/grid (labels like "Supplier:" differ a lot in length). The document title must stay on one line.
- QR payment framing in *UOL IIS* follows the Czech Banking Association graphic manual (quiet zone 4T, 1.5 pt frame,
  caption 16T x 4T, gaps 2T). The data URL SVG from `qrDataUrl()` already includes the 4T quiet zone.
- The XSD validator needs the XML declaration encoding rewritten to UTF-8 (the text is already decoded).

## Licensing and privacy rules
- Project code is MIT (`LICENSE`). Third-party code and the ISDOC schemas keep their own licenses
  (`THIRD_PARTY_NOTICES.md`). Do not add ISDOC schemas whose header has no permission to redistribute
  (5.1, 5.2 and 5.2.1 were excluded for that reason). Never edit schema headers.
- Do not commit real invoices or any personal/customer data. `docs/samples/` contains fictional data only.
- Use the GitHub no-reply e-mail for commits to this repository, not a work e-mail address.
