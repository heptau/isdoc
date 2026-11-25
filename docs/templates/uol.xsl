<?xml version="1.0" encoding="utf-8"?>
<!--
  "UOL IIS" variant: the look of the invoices.xsl template from the UOL client (iis-uol.jar/content/iis-VERSION/print),
  rewritten from the internal XML (Document/Invoice/head/body/footer) to ISDOC 6.x.
  Texts and number/date formats are {{key}} placeholders from lang/<code>.json (the uol* keys belong to this variant).
  The supplier logo (Extensions) is deliberately not loaded – the preview must not fetch anything from the internet.
  Parameters: qrSpayd, qrEpc (data: URL of the QR payment image), qrSpaydU, qrEpcU (image width in QR dots T).
-->
<xsl:stylesheet version="1.0"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:isd="http://isdoc.cz/namespace/2013"
	exclude-result-prefixes="isd">

<xsl:output method="html" encoding="utf-8" indent="no"/>
<xsl:decimal-format name="cz" decimal-separator="{{decimalSep}}" grouping-separator="{{groupSep}}"/>

<xsl:param name="qrSpayd" select="''"/>
<xsl:param name="qrEpc" select="''"/>
<xsl:param name="qrSpaydU" select="41"/>
<xsl:param name="qrEpcU" select="41"/>
<xsl:param name="sigBy" select="''"/>
<xsl:param name="sigTime" select="''"/>
<xsl:param name="sigCert" select="''"/>
<xsl:param name="sigHash" select="''"/>
<xsl:param name="sigTrusted" select="''"/>

<xsl:variable name="nfMoney" select="'{{pMoney}}'"/>
<xsl:variable name="nfQty" select="'{{pQty}}'"/>
<xsl:variable name="nfUnit" select="'{{pUnit}}'"/>
<xsl:variable name="nfPct" select="'{{pPct}}'"/>
<xsl:variable name="nfRate" select="'{{pRate}}'"/>

<xsl:variable name="inv" select="/isd:Invoice"/>
<xsl:variable name="docType" select="number($inv/isd:DocumentType)"/>
<xsl:variable name="local" select="$inv/isd:LocalCurrencyCode"/>
<xsl:variable name="foreign" select="$inv/isd:ForeignCurrencyCode[. != $inv/isd:LocalCurrencyCode]"/>
<!-- VAT payer unless stated otherwise -->
<xsl:variable name="vatPayer" select="not($inv/isd:VATApplicable='false' or $inv/isd:VATApplicable='0')"/>
<!-- the VAT recap and VAT columns are shown only on tax documents (type 4 = proforma invoice without VAT) -->
<xsl:variable name="showVat" select="$vatPayer and $docType != 4"/>
<xsl:variable name="hasDiscount" select="count($inv/isd:InvoiceLines/isd:InvoiceLine[isd:LineExtensionAmountBeforeDiscount and number(isd:LineExtensionAmountBeforeDiscount) != number(isd:LineExtensionAmount)]) &gt; 0"/>
<xsl:variable name="pay42" select="$inv/isd:PaymentMeans/isd:Payment[isd:PaymentMeansCode=42]"/>
<xsl:variable name="pay" select="($pay42 | $inv/isd:PaymentMeans/isd:Payment[not($pay42)])[1]"/>

<xsl:template match="/">
<html lang="{{code}}">
<head>
	<meta charset="utf-8"/>
	<title><xsl:value-of select="$inv/isd:ID"/></title>
	<style>
		html,body{background:#aaa;margin:0;font:11px/1.3 "Lucida Grande CE", Verdana, Helvetica, "Trebuchet MS", sans-serif;padding:0}
		.page{background-color:#fff;max-width:190mm;border:1px solid #888;margin:16px auto;padding:10mm}
		.print{position:relative;margin:0;padding:0}
		div.supplier,div.customer,div.info .data,div.note,table.items td.desc{overflow-wrap:anywhere}
		a{text-decoration:none;color:#000}
		div{margin:0}

		/* Top band (120 px): document title on the right, supplier below it. The customer window starts right below. */
		.head{position:relative;height:120px;container-type:inline-size}
		/* The document title is always on one line: the font shrinks with the character count (--n) to fit the page width. */
		div.invoice{position:absolute;right:0;top:16px;white-space:nowrap;text-align:right;font-size:14px;line-height:1.2}
		@supports (font-size:1cqw){div.invoice{font-size:min(18px, calc(100cqw / (var(--n) * .62)))}}
		div.supplier{position:absolute;top:60px;left:0;right:0}
		div.supplier .sname{display:flex;gap:.6em;align-items:baseline}
		div.supplier .sname .title{flex:none}
		div.supplier .sname .name{font-weight:bold}
		div.supplier .saddr>span:before{content:', '}
		div.supplier .saddr>span:first-child:before{content:''}
		div.supplier .saddr>span.registrace:before{content:' '}
		div.supplier .mail .label,div.supplier .tel .label{text-transform:lowercase}

		/* Middle band: payment details on the left, customer on the right (window position as in the original: 120 px from the top, 50 % width on the right). */
		.mid{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;min-height:210px;margin-bottom:48px}
		div.info{flex:0 1 47%;min-width:0;display:grid;grid-template-columns:max-content minmax(0,1fr);column-gap:12px;align-content:start;padding:2px 0}
		div.info>div{display:contents}
		div.info .label{font-style:italic;padding:1px 0 0 0}
		div.info .data{padding:1px 0 0 0}
		.info .vat_date>*,.info .uhrada>*{margin-top:15px}
		.info .due_date>*{margin-bottom:15px}
		.info .vs .data,.info .ucet .data,.info .due_date .data{font-weight:bold}

		div.customer{flex:0 0 50%;min-width:0}
		div.customer div div{padding:0 0 0 60px}
		div.customer div.addr2,div.customer div.addr1{border:1px solid #bbb;margin:7px 0 0 0}
		div.customer span.title{position:relative;top:-7px;left:8px;background-color:#fff}
		div.customer .name{font-weight:bold}
		div.customer div.name{padding-top:9px}
		div.customer div.stat{padding-bottom:4px}
		div.customer .addr1 div.stat{text-transform:uppercase}
		div.customer .addr1 div:first-line{font-size:15px}
		div.customer div.ids{padding:0 8px 10px 60px;display:flex;flex-wrap:wrap;gap:0 14px}

		div.note{padding:0 0 12px 0;font-size:9px;line-height:1.3;position:relative;top:-12px;white-space:pre-line}
		table{margin:11px 0 0 0;font-size:11px;line-height:1.3;empty-cells:show;border-collapse:collapse}
		table td{padding:2px .5ex}
		table thead td{border-bottom:1px solid #bbb;font-style:italic;background-color:#fafafa}
		table.items{width:100%}
		table td.quantity{text-align:right;white-space:nowrap}
		table thead td.quantity{text-align:center}
		table td.price{text-align:right;white-space:nowrap}
		table td.vat{text-align:right}
		table td.total{text-align:right;white-space:nowrap}
		table td.discount{text-align:right;white-space:nowrap}
		table td.c_vat{text-align:right;white-space:nowrap}
		table thead td{white-space:normal}
		table thead td,table tbody td{vertical-align:bottom}
		table tbody td.kod{text-transform:lowercase;vertical-align:top}
		table tbody td.sub{font-size:9px;color:#555;padding-top:0}
		table tbody tr:hover{background-color:#ffd}

		/* Footer: VAT recap on the left, totals on the right; side by side but without overlapping. */
		div.footer{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px 16px;margin-top:20px}
		div.footer .recap{flex:0 1 auto;min-width:min-content;max-width:100%}
		table.rekapitulace{margin:0}
		table.rekapitulace td{white-space:nowrap}
		table.rekapitulace thead td{white-space:normal}
		div.rekapitulace{padding:2px 0}
		div.summary{flex:0 0 45%;min-width:0;margin-left:auto}
		div.summary .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:1px 0}
		div.summary .row.alone{justify-content:flex-end}
		div.summary .row .val{text-align:right}
		div.summary .total .label{font-size:11px}
		div.summary .total .val{font-weight:bold;font-size:14px}
		div.qrs{display:flex;gap:28px;margin:18px 0 0;flex-wrap:wrap;align-items:flex-start;page-break-inside:avoid}

		/* QR payment per the graphic manual (qr-platba.cz): T = one "dot" of the code, the 4T quiet zone is part of the image,
		   a 1.5 pt frame around the quiet zone, interrupted at the bottom edge by the caption (Arial Bold, 16T x 4T), 2T gaps. */
		div.qrp{--size:38mm;--T:calc(var(--size) / var(--u));position:relative;flex:none;width:var(--size);height:var(--size);margin:0 0 calc(var(--T) * 5);background:#fff}
		div.qrp img{display:block;width:100%;height:100%;image-rendering:pixelated}
		div.qrp .fr{position:absolute;top:0;left:0;right:0;bottom:0;box-sizing:border-box;border:1.5pt solid #000;border-bottom:0}
		div.qrp .base{position:absolute;left:0;right:0;top:100%;display:flex;align-items:flex-start}
		div.qrp .ln{height:0;border-top:1.5pt solid #000;margin-top:-1.5pt}
		div.qrp .st{flex:none;width:calc(var(--T) * 2)}
		div.qrp .fill{flex:1 1 0}
		div.qrp .cap{flex:none;box-sizing:border-box;margin:0 calc(var(--T) * 2);min-width:calc(var(--T) * 16);height:calc(var(--T) * 4);font-family:Arial,Helvetica,"Liberation Sans",sans-serif;font-weight:bold;font-size:calc(var(--T) * 3.39);line-height:calc(var(--T) * 4);white-space:nowrap}
		/* Electronic signature note: small, below everything else (the window envelope layout above stays untouched). */
		div.sigbox{margin:18px 0 0;padding-top:6px;border-top:1px solid #999;font-size:9px;color:#444;page-break-inside:avoid}
		div.sigbox .row{display:flex;gap:8px;margin:1px 0}
		div.sigbox .k{flex:none;color:#666}
		div.sigbox .fp{font-family:Menlo,Consolas,"Liberation Mono",monospace;font-size:8.5px;word-break:break-all}
		@media print{html,body{background-color:#fff}.page{page-break-after:always;max-width:100%;border:none;margin:0;padding:0}div.footer{page-break-inside:avoid}}
	</style>
</head>
<body><xsl:apply-templates select="$inv"/></body>
</html>
</xsl:template>

<xsl:template match="isd:Invoice">
<div class="page"><div class="print">

	<xsl:variable name="docTitle">
		<xsl:choose>
			<xsl:when test="$docType=1">{{docType1}}</xsl:when>
			<xsl:when test="$docType=2">{{docType2}}</xsl:when>
			<xsl:when test="$docType=3">{{docType3}}</xsl:when>
			<xsl:when test="$docType=4">{{docType4}}</xsl:when>
			<xsl:when test="$docType=5">{{docType5}}</xsl:when>
			<xsl:when test="$docType=6">{{docType6}}</xsl:when>
			<xsl:when test="$docType=7">{{docType7}}</xsl:when>
			<xsl:otherwise>{{docTypeOther}}</xsl:otherwise>
		</xsl:choose>
		<xsl:text> {{invoiceNo}}: </xsl:text><xsl:value-of select="isd:ID"/>
	</xsl:variable>

	<div class="head">
		<div class="invoice" style="--n:{string-length($docTitle)}"><xsl:value-of select="$docTitle"/></div>
		<xsl:apply-templates select="isd:AccountingSupplierParty/isd:Party" mode="supplier"/>
	</div>

	<div class="mid">
	<div class="info">
		<xsl:if test="normalize-space($pay/isd:Details/isd:VariableSymbol)!=''"><div class="vs"><span class="label">{{vs}}: </span><span class="data"><xsl:value-of select="$pay/isd:Details/isd:VariableSymbol"/></span></div></xsl:if>
		<xsl:if test="normalize-space($pay/isd:Details/isd:ConstantSymbol)!=''"><div class="ks"><span class="label">{{ks}}: </span><span class="data"><xsl:value-of select="$pay/isd:Details/isd:ConstantSymbol"/></span></div></xsl:if>
		<xsl:if test="normalize-space($pay/isd:Details/isd:SpecificSymbol)!=''"><div class="ss"><span class="label">{{ss}}: </span><span class="data"><xsl:value-of select="$pay/isd:Details/isd:SpecificSymbol"/></span></div></xsl:if>
		<xsl:if test="$pay">
			<div class="uhrada"><span class="label">{{payMethod}}: </span><span class="data">
				<xsl:choose>
					<xsl:when test="$pay/isd:PaymentMeansCode=10">{{pm10}}</xsl:when>
					<xsl:when test="$pay/isd:PaymentMeansCode=20">{{pm20}}</xsl:when>
					<xsl:when test="$pay/isd:PaymentMeansCode=31">{{pm31}}</xsl:when>
					<xsl:when test="$pay/isd:PaymentMeansCode=42">{{pm42}}</xsl:when>
					<xsl:when test="$pay/isd:PaymentMeansCode=48">{{pm48}}</xsl:when>
					<xsl:when test="$pay/isd:PaymentMeansCode=49">{{pm49}}</xsl:when>
					<xsl:when test="$pay/isd:PaymentMeansCode=50">{{pm50}}</xsl:when>
					<xsl:when test="$pay/isd:PaymentMeansCode=97">{{pm97}}</xsl:when>
					<xsl:otherwise>{{pmCode}} <xsl:value-of select="$pay/isd:PaymentMeansCode"/></xsl:otherwise>
				</xsl:choose>
			</span></div>
		</xsl:if>
		<xsl:if test="normalize-space($pay/isd:Details/isd:ID)!=''">
			<div class="ucet"><span class="label">{{uolBankAccount}}: </span><span class="data"><xsl:value-of select="$pay/isd:Details/isd:ID"/>/<xsl:value-of select="$pay/isd:Details/isd:BankCode"/></span></div>
		</xsl:if>
		<xsl:if test="normalize-space($pay/isd:Details/isd:Name)!=''"><div class="banka"><span class="label">{{bank}}: </span><span class="data"><xsl:value-of select="$pay/isd:Details/isd:Name"/></span></div></xsl:if>
		<xsl:if test="normalize-space($pay/isd:Details/isd:IBAN)!=''">
			<xsl:variable name="i" select="translate($pay/isd:Details/isd:IBAN,' ','')"/>
			<div class="iban"><span class="label">IBAN: </span><span class="data"><xsl:value-of select="concat(substring($i,1,4),' ',substring($i,5,4),' ',substring($i,9,4),' ',substring($i,13,4),' ',substring($i,17,4),' ',substring($i,21,4),' ',substring($i,25,4),' ',substring($i,29))"/></span></div>
		</xsl:if>
		<xsl:if test="normalize-space($pay/isd:Details/isd:BIC)!=''"><div class="bic"><span class="label">BIC: </span><span class="data"><xsl:value-of select="$pay/isd:Details/isd:BIC"/></span></div></xsl:if>
		<xsl:if test="isd:TaxPointDate"><div class="vat_date"><span class="label">{{taxPointDate}}: </span><span class="data"><xsl:call-template name="date"><xsl:with-param name="d" select="isd:TaxPointDate"/></xsl:call-template></span></div></xsl:if>
		<div class="issue_date"><span class="label">{{issueDate}}: </span><span class="data"><xsl:call-template name="date"><xsl:with-param name="d" select="isd:IssueDate"/></xsl:call-template></span></div>
		<xsl:if test="normalize-space($pay/isd:Details/isd:PaymentDueDate)!=''">
			<div class="due_date"><span class="label">{{dueDate}}: </span><span class="data"><xsl:call-template name="date"><xsl:with-param name="d" select="$pay/isd:Details/isd:PaymentDueDate"/></xsl:call-template></span></div>
		</xsl:if>
		<xsl:if test="normalize-space(isd:OrderReferences/isd:OrderReference[1]/isd:SalesOrderID)!=''">
			<div class="objednavka"><span class="label">{{orders}}: </span><span class="data"><xsl:value-of select="isd:OrderReferences/isd:OrderReference[1]/isd:SalesOrderID"/></span></div>
		</xsl:if>
		<xsl:if test="normalize-space(isd:DeliveryNoteReferences/isd:DeliveryNoteReference[1]/isd:ID)!=''">
			<div class="dodaci_list"><span class="label">{{deliveryNotes}}: </span><span class="data"><xsl:value-of select="isd:DeliveryNoteReferences/isd:DeliveryNoteReference[1]/isd:ID"/></span></div>
		</xsl:if>
	</div>

	<div class="customer">
		<xsl:variable name="c" select="isd:AccountingCustomerParty/isd:Party"/>
		<div class="addr1"><span class="title">{{customer}}: </span>
			<xsl:call-template name="address"><xsl:with-param name="p" select="$c"/></xsl:call-template>
			<xsl:call-template name="vatin"><xsl:with-param name="p" select="$c"/></xsl:call-template>
		</div>
		<xsl:if test="isd:Delivery/isd:Party/isd:PartyName/isd:Name">
			<div class="addr2"><span class="title">{{uolDelivery}}: </span>
				<xsl:call-template name="address"><xsl:with-param name="p" select="isd:Delivery/isd:Party"/></xsl:call-template>
			</div>
		</xsl:if>
	</div>
	</div><!-- /mid -->

	<xsl:if test="normalize-space(isd:Note)!=''"><div class="note"><xsl:value-of select="isd:Note"/></div></xsl:if>

	<!-- items -->
	<table class="items">
		<thead><tr>
			<td class="kod">{{uolItemCode}}</td>
			<td>{{uolItemSubject}}</td>
			<td class="quantity" colspan="2">{{uolQty}}</td>
			<td class="price">{{uolUnitPrice}}</td>
			<xsl:if test="$hasDiscount">
				<td class="discount">{{uolDiscount}}</td>
				<td class="price">{{uolUnitPriceAfter}}</td>
			</xsl:if>
			<xsl:if test="$showVat">
				<td class="total">{{uolNet}}</td>
				<td class="vat">{{uolVatRate}}</td>
			</xsl:if>
			<td class="total">{{uolItemTotal}}</td>
		</tr></thead>
		<tbody>
			<xsl:for-each select="isd:InvoiceLines/isd:InvoiceLine">
				<xsl:variable name="before" select="number(isd:LineExtensionAmountBeforeDiscount)"/>
				<xsl:variable name="net" select="number(isd:LineExtensionAmount)"/>
				<xsl:variable name="qty" select="number(isd:InvoicedQuantity)"/>
				<tr>
					<td class="kod"><xsl:value-of select="isd:Item/isd:SellersItemIdentification/isd:ID"/></td>
					<td class="desc"><xsl:value-of select="isd:Item/isd:Description"/></td>
					<td class="quantity"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:InvoicedQuantity"/><xsl:with-param name="f" select="$nfQty"/></xsl:call-template></td>
					<td class="unit"><xsl:value-of select="isd:InvoicedQuantity/@unitCode"/></td>
					<xsl:choose>
						<xsl:when test="$hasDiscount">
							<td class="price"><xsl:if test="$qty != 0 and string($before)!='NaN'"><xsl:value-of select="format-number($before div $qty,$nfUnit,'cz')"/></xsl:if></td>
							<td class="discount"><xsl:if test="$before != 0 and string($net)!='NaN' and string($before)!='NaN'"><xsl:value-of select="format-number((1 - $net div $before) * 100,$nfPct,'cz')"/>&#160;%</xsl:if></td>
							<td class="price"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:UnitPrice"/><xsl:with-param name="f" select="$nfUnit"/></xsl:call-template></td>
						</xsl:when>
						<xsl:otherwise>
							<td class="price"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:UnitPrice"/><xsl:with-param name="f" select="$nfUnit"/></xsl:call-template></td>
						</xsl:otherwise>
					</xsl:choose>
					<xsl:if test="$showVat">
						<td class="total"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:LineExtensionAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
						<td class="vat"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:ClassifiedTaxCategory/isd:Percent"/><xsl:with-param name="f" select="$nfPct"/></xsl:call-template>&#160;%</td>
					</xsl:if>
					<td class="total"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:LineExtensionAmountTaxInclusive"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
				</tr>
				<xsl:if test="normalize-space(isd:Note)!=''">
					<tr><td/><td class="sub" colspan="8"><xsl:value-of select="isd:Note"/></td></tr>
				</xsl:if>
			</xsl:for-each>
		</tbody>
	</table>

	<!-- footer: VAT recap and totals -->
	<div class="footer">
		<div class="recap">
		<xsl:choose>
			<xsl:when test="$showVat">
				<table class="rekapitulace">
					<thead><tr>
						<td class="vat">{{uolVatRate}}</td>
						<td class="total">{{uolBase}}<xsl:if test="$foreign"> [<xsl:value-of select="$foreign"/>]</xsl:if></td>
						<td class="c_vat">{{vat}}<xsl:if test="$foreign"> [<xsl:value-of select="$foreign"/>]</xsl:if></td>
						<xsl:if test="$foreign">
							<td class="total">{{uolBase}} [<xsl:value-of select="$local"/>]</td>
							<td class="c_vat">{{vat}} [<xsl:value-of select="$local"/>]</td>
						</xsl:if>
					</tr></thead>
					<tbody>
						<xsl:for-each select="isd:TaxTotal/isd:TaxSubTotal">
							<tr>
								<td class="vat"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxCategory/isd:Percent"/><xsl:with-param name="f" select="$nfPct"/></xsl:call-template>&#160;%</td>
								<xsl:choose>
									<xsl:when test="$foreign">
										<td class="total"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxableAmountCurr"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
										<td class="c_vat"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxAmountCurr"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
										<td class="total"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxableAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
										<td class="c_vat"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
									</xsl:when>
									<xsl:otherwise>
										<td class="total"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxableAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
										<td class="c_vat"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
									</xsl:otherwise>
								</xsl:choose>
							</tr>
						</xsl:for-each>
					</tbody>
				</table>
			</xsl:when>
			<xsl:when test="$vatPayer"><div class="rekapitulace"><span>{{uolNotTaxDoc}}</span></div></xsl:when>
			<xsl:otherwise><div class="rekapitulace"><span>{{uolNotVatPayer}}</span></div></xsl:otherwise>
		</xsl:choose>
		</div>

		<div class="summary">
			<xsl:variable name="t" select="isd:LegalMonetaryTotal"/>
			<xsl:if test="$t/isd:PayableRoundingAmount != 0">
				<div class="row"><span class="label">{{rounding}}: </span><span class="val"><xsl:call-template name="num"><xsl:with-param name="v" select="$t/isd:PayableRoundingAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></span></div>
			</xsl:if>
			<xsl:if test="$t/isd:PaidDepositsAmount != 0">
				<div class="row"><span class="label">{{paidDeposits}}: </span><span class="val"><xsl:call-template name="num"><xsl:with-param name="v" select="$t/isd:PaidDepositsAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></span></div>
			</xsl:if>
			<div class="row total"><span class="label">{{uolTotalToPay}}:</span>
				<xsl:choose>
					<xsl:when test="$foreign and $t/isd:PayableAmountCurr">
						<span class="val"><xsl:call-template name="num"><xsl:with-param name="v" select="$t/isd:PayableAmountCurr"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template><xsl:value-of select="concat(' ',$foreign)"/></span>
					</xsl:when>
					<xsl:otherwise>
						<span class="val"><xsl:call-template name="num"><xsl:with-param name="v" select="$t/isd:PayableAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template><xsl:value-of select="concat(' ',$local)"/></span>
					</xsl:otherwise>
				</xsl:choose>
			</div>
			<xsl:if test="$foreign">
				<div class="row alone"><span class="val"><xsl:call-template name="num"><xsl:with-param name="v" select="$t/isd:PayableAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template><xsl:value-of select="concat(' ',$local)"/></span></div>
				<xsl:if test="number($inv/isd:RefCurrRate) != 0">
					<div class="row"><span class="label">{{rate}}: </span><span class="val"><xsl:value-of select="concat('1 ',$foreign,' = ',format-number($inv/isd:CurrRate div $inv/isd:RefCurrRate,$nfRate,'cz'),' ',$local)"/></span></div>
				</xsl:if>
			</xsl:if>
		</div>
	</div>

	<xsl:if test="$qrSpayd != '' or $qrEpc != ''">
		<div class="qrs">
			<xsl:if test="$qrSpayd != ''">
				<xsl:call-template name="qrbox"><xsl:with-param name="src" select="$qrSpayd"/><xsl:with-param name="u" select="$qrSpaydU"/><xsl:with-param name="caption">{{uolQrSpayd}}</xsl:with-param></xsl:call-template>
			</xsl:if>
			<xsl:if test="$qrEpc != ''">
				<xsl:call-template name="qrbox"><xsl:with-param name="src" select="$qrEpc"/><xsl:with-param name="u" select="$qrEpcU"/><xsl:with-param name="caption">{{uolQrEpc}}</xsl:with-param></xsl:call-template>
			</xsl:if>
		</div>
	</xsl:if>

	<xsl:if test="$sigBy != ''">
		<div class="sigbox">
			<div class="row"><strong>{{dsigTitle}}</strong><xsl:if test="$sigTrusted = 'true'"> – {{dsigTrusted}}</xsl:if></div>
			<div class="row"><span class="k">{{dsigBy}}:</span><span><xsl:value-of select="$sigBy"/></span><xsl:if test="$sigTime != ''"><span class="k">{{dsigTime}}:</span><span><xsl:value-of select="$sigTime"/></span></xsl:if></div>
			<div class="row"><span class="k">{{dsigCert}}:</span><span class="fp"><xsl:value-of select="$sigCert"/></span></div>
			<div class="row"><span class="k">{{dsigHash}}:</span><span class="fp"><xsl:value-of select="$sigHash"/></span></div>
		</div>
	</xsl:if>

</div></div>
</xsl:template>

<!-- QR payment in a frame per the graphic manual -->
<xsl:template name="qrbox">
	<xsl:param name="src"/>
	<xsl:param name="u"/>
	<xsl:param name="caption"/>
	<div class="qrp" style="--u:{$u}">
		<img alt="QR" src="{$src}"/>
		<div class="fr"/>
		<div class="base"><span class="ln st"/><span class="cap"><xsl:value-of select="$caption"/></span><span class="ln fill"/></div>
	</div>
</xsl:template>

<!-- supplier: strip at the top -->
<xsl:template match="isd:Party" mode="supplier">
	<div class="supplier">
		<div class="sname"><span class="title">{{supplier}}:</span><span class="name"><xsl:value-of select="isd:PartyName/isd:Name"/></span></div>
		<div class="saddr">
			<span class="street"><xsl:value-of select="isd:PostalAddress/isd:StreetName"/><xsl:if test="normalize-space(isd:PostalAddress/isd:BuildingNumber)!=''"><xsl:text> </xsl:text><xsl:value-of select="isd:PostalAddress/isd:BuildingNumber"/></xsl:if></span>
			<span><xsl:value-of select="isd:PostalAddress/isd:PostalZone"/></span>
			<span><xsl:value-of select="isd:PostalAddress/isd:CityName"/></span>
			<span><xsl:value-of select="isd:PostalAddress/isd:Country/isd:IdentificationCode"/></span>
			<xsl:if test="normalize-space(isd:PartyIdentification/isd:ID)!=''"><span><span class="label">{{companyId}}: </span><xsl:value-of select="isd:PartyIdentification/isd:ID"/></span></xsl:if>
			<xsl:if test="normalize-space(isd:PartyTaxScheme/isd:CompanyID)!=''"><span><span class="label">{{vatId}}: </span><xsl:value-of select="isd:PartyTaxScheme/isd:CompanyID"/></span></xsl:if>
			<xsl:if test="normalize-space(isd:Contact/isd:Telephone)!=''"><span class="tel"><span class="label">{{tel}}: </span><xsl:value-of select="isd:Contact/isd:Telephone"/></span></xsl:if>
			<xsl:if test="normalize-space(isd:Contact/isd:ElectronicMail)!=''"><span class="mail"><span class="label">{{uolEmail}}: </span><xsl:value-of select="isd:Contact/isd:ElectronicMail"/></span></xsl:if>
			<xsl:if test="isd:RegisterIdentification/isd:RegisterKeptAt">
				<span class="registrace">{{uolRegistered}}: <xsl:if test="normalize-space(isd:RegisterIdentification/isd:RegisterDate)!=''"><xsl:call-template name="date"><xsl:with-param name="d" select="isd:RegisterIdentification/isd:RegisterDate"/></xsl:call-template>, </xsl:if><xsl:value-of select="isd:RegisterIdentification/isd:RegisterKeptAt"/><xsl:if test="normalize-space(isd:RegisterIdentification/isd:RegisterFileRef)!=''">, <xsl:value-of select="isd:RegisterIdentification/isd:RegisterFileRef"/></xsl:if>.</span>
			</xsl:if>
		</div>
	</div>
</xsl:template>

<xsl:template name="address">
	<xsl:param name="p"/>
	<div class="name"><xsl:value-of select="$p/isd:PartyName/isd:Name"/></div>
	<div class="street"><xsl:value-of select="$p/isd:PostalAddress/isd:StreetName"/><xsl:if test="normalize-space($p/isd:PostalAddress/isd:BuildingNumber)!=''"><xsl:text> </xsl:text><xsl:value-of select="$p/isd:PostalAddress/isd:BuildingNumber"/></xsl:if></div>
	<div><xsl:value-of select="concat($p/isd:PostalAddress/isd:PostalZone,' ',$p/isd:PostalAddress/isd:CityName)"/></div>
	<div class="stat"><xsl:value-of select="$p/isd:PostalAddress/isd:Country/isd:IdentificationCode"/></div>
</xsl:template>

<xsl:template name="vatin">
	<xsl:param name="p"/>
	<xsl:if test="normalize-space($p/isd:PartyIdentification/isd:ID)!='' or normalize-space($p/isd:PartyTaxScheme/isd:CompanyID)!=''">
		<div class="ids">
			<xsl:if test="normalize-space($p/isd:PartyIdentification/isd:ID)!=''"><span>{{companyId}}: <xsl:value-of select="$p/isd:PartyIdentification/isd:ID"/></span></xsl:if>
			<xsl:if test="normalize-space($p/isd:PartyTaxScheme/isd:CompanyID)!=''"><span>{{vatId}}: <xsl:value-of select="$p/isd:PartyTaxScheme/isd:CompanyID"/></span></xsl:if>
		</div>
	</xsl:if>
</xsl:template>

<!-- Number formatted according to the language; a missing value = nothing, non-numeric text is printed as is (the document may be invalid) -->
<xsl:template name="num">
	<xsl:param name="v"/>
	<xsl:param name="f"/>
	<xsl:choose>
		<xsl:when test="string($v)=''"/>
		<xsl:when test="string(number($v))='NaN' and string($v)!='NaN'"><xsl:value-of select="string($v)"/></xsl:when>
		<xsl:when test="string(number($v))='NaN'"/>
		<xsl:otherwise><xsl:value-of select="format-number($v,$f,'cz')"/></xsl:otherwise>
	</xsl:choose>
</xsl:template>

<!-- yyyy-mm-dd -> per language (order dmy|mdy|ymd, separator, zero padding) -->
<xsl:variable name="dateOrder" select="'{{dateOrder}}'"/>
<xsl:variable name="dateSep" select="'{{dateSep}}'"/>
<xsl:variable name="datePad" select="'{{datePad}}'"/>
<xsl:template name="date">
	<xsl:param name="d"/>
	<xsl:if test="string-length($d) &gt;= 10">
		<xsl:variable name="y" select="substring($d,1,4)"/>
		<xsl:variable name="m">
			<xsl:choose><xsl:when test="$datePad='1'"><xsl:value-of select="substring($d,6,2)"/></xsl:when>
				<xsl:otherwise><xsl:value-of select="number(substring($d,6,2))"/></xsl:otherwise></xsl:choose>
		</xsl:variable>
		<xsl:variable name="dd">
			<xsl:choose><xsl:when test="$datePad='1'"><xsl:value-of select="substring($d,9,2)"/></xsl:when>
				<xsl:otherwise><xsl:value-of select="number(substring($d,9,2))"/></xsl:otherwise></xsl:choose>
		</xsl:variable>
		<xsl:choose>
			<xsl:when test="$dateOrder='ymd'"><xsl:value-of select="concat($y,$dateSep,$m,$dateSep,$dd)"/></xsl:when>
			<xsl:when test="$dateOrder='mdy'"><xsl:value-of select="concat($m,$dateSep,$dd,$dateSep,$y)"/></xsl:when>
			<xsl:otherwise><xsl:value-of select="concat($dd,$dateSep,$m,$dateSep,$y)"/></xsl:otherwise>
		</xsl:choose>
	</xsl:if>
</xsl:template>

</xsl:stylesheet>
