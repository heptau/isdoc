# Third-party components and their licenses

The MIT license in `LICENSE` covers only this project's own code. The components below are part of the repository
but **remain under their own licenses**, which must be kept when redistributing.

## Overview

| Component | Version | License | Location |
|---|---|---|---|
| JSZip | 3.10.1 | MIT or GPLv3 (we choose MIT) | `docs/vendor/jszip.min.js` |
| pako (part of JSZip) | 1.0.11 | MIT | bundled in `docs/vendor/jszip.min.js` |
| qrcode-generator | 1.4.4 | MIT | `docs/vendor/qrcode.js` |
| xmllint-wasm (libxml2 in WebAssembly) | 5.3.0 | MIT | `docs/vendor/xmllint/` |
| xslt-polyfill | 1.0.37 | BSD-3-Clause | `docs/vendor/xslt-polyfill.min.js`, text in `docs/vendor/xslt-polyfill.LICENSE` |
| libxslt and libxml2 (inside xslt-polyfill) | – | MIT, resp. MIT with a clause about the author's name (see below) | bundled as WebAssembly in `docs/vendor/xslt-polyfill.min.js` |
| ISDOC schemas | 5.2.2, 5.2.3, 5.3, 5.3.1, 6.0.1, 6.0.2 | own terms (see below) | `docs/schemas/` |

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED (notice from the qrcode-generator header).

## License texts

### JSZip 3.10.1 – MIT (one of the two offered licenses; we choose MIT)

```
Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### pako 1.0.11 – MIT (bundled in JSZip)

```
(The MIT License)

Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### qrcode-generator 1.4.4 – MIT

The package has no separate license file; the header of `docs/vendor/qrcode.js` says "Licensed under the MIT license".
Copyright (c) 2009 Kazuhiko Arase, http://www.d-project.com/. The terms are the standard MIT license text
(identical to the text in `LICENSE` of this project, with this copyright holder).

### xmllint-wasm 5.3.0 (libxml2) – MIT

The full text is in `docs/vendor/xmllint/COPYING` (Copyright (C) 1998-2018 libxml and libxml.js authors).

### xslt-polyfill 1.0.37 – BSD-3-Clause

The full text is in `docs/vendor/xslt-polyfill.LICENSE` (Copyright (c) 2025, Mason Freed). BSD-3-Clause requires the
copyright notice and the license text to be kept when redistributing in binary form too.

### libxslt and libxml2 inside xslt-polyfill

The polyfill contains libxslt and libxml2 compiled to WebAssembly (according to the package documentation).
Their upstream `Copyright` files (GNOME) say:

- **libxml2:** Copyright (C) 1998-2012 Daniel Veillard and The Libxml2 Contributors; the standard MIT license.
- **libxslt:** Copyright (C) 2001-2002 Daniel Veillard (libexslt: also Thomas Broyer, Charlie Bozeman and Daniel Veillard);
  an MIT-style license with an added clause forbidding the use of the author's name in advertising (X11 variant).

Full texts (the `Copyright` files from the GNOME/libxml2 and GNOME/libxslt repositories on GitHub, as of 22 Nov 2026):

#### libxml2

```
Except where otherwise noted in the source code (e.g. the files dict.c and
list.c, which are covered by a similar licence but with different Copyright
notices) all the files are:

 Copyright (C) 1998-2012 Daniel Veillard.  All Rights Reserved.
 Copyright (C) The Libxml2 Contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is fur-
nished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FIT-
NESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

#### libxslt and libexslt

```
Licence for libxslt except libexslt
----------------------------------------------------------------------
 Copyright (C) 2001-2002 Daniel Veillard.  All Rights Reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is fur-
nished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FIT-
NESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
DANIEL VEILLARD BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CON-
NECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Except as contained in this notice, the name of Daniel Veillard shall not
be used in advertising or otherwise to promote the sale, use or other deal-
ings in this Software without prior written authorization from him.

----------------------------------------------------------------------

Licence for libexslt
----------------------------------------------------------------------
 Copyright (C) 2001-2002 Thomas Broyer, Charlie Bozeman and Daniel Veillard.
 All Rights Reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is fur-
nished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FIT-
NESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CON-
NECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Except as contained in this notice, the name of the authors shall not
be used in advertising or otherwise to promote the sale, use or other deal-
ings in this Software without prior written authorization from him.
----------------------------------------------------------------------
```

## ISDOC schemas (`docs/schemas/`)

The files `docs/schemas/isdoc-invoice-*.xsd` are schemas of the ISDOC format (source: isdoc.cz and the author's
archive). **They are not part of this project's MIT license.** Copyright: Association for Information Society (SPIS),
ICT UNIE o.s., and for version 6.0.2 also the Czech Ministry of the Interior (MVČR).

Only versions whose header contains a permission to redistribute are included (5.2.2, 5.2.3, 5.3, 5.3.1, 6.0.1,
6.0.2). In essence, the header says:

- the schema and its documentation may be copied, modified and distributed for any purpose and free of charge,
  provided that the copyright notice and that paragraph are kept in all copies,
- it is provided "as is", without warranty,
- the names SPIS, ICT UNIE and ISDOC may not be used to endorse or promote derived products without prior written permission.

**Do not remove or alter the headers in the files.** Use the name ISDOC only descriptively (the format the program
reads) and do not imply that this is an official tool.

The schemas of versions 5.1, 5.2 and 5.2.1 do **not** belong in the repository: their headers contain only a copyright
notice, no permission to redistribute. Documents of those versions are validated against the closest available schema (5.2.2).

## Own work based on other sources

- `docs/templates/uol.xsl` ("UOL IIS") is a conversion of the look of the `invoices.xsl` template from the UOL IIS
  client to ISDOC; the author of the original template is the author of this project.
- The look of the QR payment (`docs/templates/uol.xsl`) follows the public display rules of the Czech Banking
  Association ("Graphic manual", qr-platba.cz). The manual itself is not part of the repository.
- QR payment formats: the Czech QR payment (SPAYD) and EPC QR (SEPA) are publicly documented standards.
