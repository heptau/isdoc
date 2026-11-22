<?xml version="1.0" encoding="utf-8"?>
<!--
  ISDOC 6.x -> HTML (XSLT 1.0, runnable in the browser via XSLTProcessor).
  Based on the old isdoc.xsl template (IIS/UOL), rewritten without Mozilla chrome:// dependencies.
  Texts and number/date formats are {{key}} placeholders – the app replaces them before use
  with values from lang/<code>.json (see js/lang.js). This is the "standard" template (js/templates.js).
  Before the transformation the app converts the old ISDOC 2009 namespace to 2013,
  so only the isd: prefix is used here.

  Parameters (optional, passed by the app):
    qrSpayd  data: URL of an image with the Czech QR payment (SPAYD)
    qrEpc    data: URL of an image with the EU QR payment (EPC / SEPA)
-->
<xsl:stylesheet version="1.0"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:isd="http://isdoc.cz/namespace/2013"
	exclude-result-prefixes="isd">

<xsl:output method="html" encoding="utf-8" indent="no"/>
<xsl:decimal-format name="cz" decimal-separator="{{decimalSep}}" grouping-separator="{{groupSep}}"/>

<xsl:param name="qrSpayd" select="''"/>
<xsl:param name="qrEpc" select="''"/>

<xsl:variable name="nfMoney" select="'{{pMoney}}'"/>
<xsl:variable name="nfQty" select="'{{pQty}}'"/>
<xsl:variable name="inv" select="/isd:Invoice"/>
<xsl:variable name="cur" select="$inv/isd:LocalCurrencyCode"/>
<xsl:variable name="foreign" select="$inv/isd:ForeignCurrencyCode[. != $inv/isd:LocalCurrencyCode]"/>

<xsl:template match="/">
<html lang="{{code}}">
<head>
	<meta charset="utf-8"/>
	<title><xsl:value-of select="$inv/isd:ID"/></title>
	<style>
		*{box-sizing:border-box}
		html,body{margin:0;padding:0;background:#e9ecef;color:#1b1f23;
			font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
		.page{background:#fff;max-width:210mm;margin:12px auto;padding:12mm 12mm 10mm;box-shadow:0 1px 6px rgba(0,0,0,.2)}
		h1{font-size:20px;margin:0}
		h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#667;margin:0 0 4px}
		.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1b1f23;padding-bottom:8px;margin-bottom:14px}
		.head .no{text-align:right;font-size:20px;font-weight:700}
		.head .sub{font-size:12px;color:#556;font-weight:400}
		.parties{display:flex;gap:16px;margin-bottom:14px}
		.party{flex:1;border:1px solid #ccd;border-radius:4px;padding:8px 10px}
		.party .name{font-weight:700;font-size:14px}
		.party .ids{margin-top:6px;color:#333}
		.party .ids span{display:inline-block;min-width:44px;color:#667}
		.party .contact{margin-top:6px;color:#556;font-size:12px}
		.meta{display:flex;flex-wrap:wrap;gap:4px 28px;margin-bottom:14px}
		.meta div span{color:#667}
		table{border-collapse:collapse;width:100%}
		.lines th{background:#eef0f3;text-align:left;font-size:11px;padding:5px 6px;border-bottom:1px solid #99a}
		.lines td{padding:5px 6px;border-bottom:1px solid #e1e3e8;vertical-align:top}
		.r{text-align:right;white-space:nowrap}
		.note{color:#667;font-size:11px}
		.row2{display:flex;gap:18px;margin-top:16px;align-items:flex-start}
		.pay{flex:1.1;border:1px solid #ccd;border-radius:4px;padding:8px 10px}
		.pay table td{padding:1px 0;vertical-align:top}
		.pay table td:first-child{color:#667;padding-right:10px;white-space:nowrap}
		.sum{flex:1}
		.sum td{padding:3px 6px}
		.sum .tot td{border-top:2px solid #1b1f23;font-size:16px;font-weight:700;padding-top:6px}
		.sum .hd td{color:#667;font-size:11px;border-bottom:1px solid #ccd}
		.qrs{display:flex;gap:18px;margin-top:10px;flex-wrap:wrap}
		.qr{text-align:center;font-size:11px;color:#445}
		.qr img{width:130px;height:130px;display:block;margin:0 auto 2px;image-rendering:pixelated}
		.notes{margin-top:14px;font-size:12px;white-space:pre-line}
		.ref{margin-top:12px;font-size:12px}
		.ref table td,.ref table th{padding:3px 6px;border-bottom:1px solid #e1e3e8;text-align:left}
		@media print{html,body{background:#fff}.page{box-shadow:none;margin:0;padding:0;max-width:none}}
	</style>
</head>
<body>
	<xsl:apply-templates select="$inv"/>
</body>
</html>
</xsl:template>

<xsl:template match="isd:Invoice">
<div class="page">
	<div class="head">
		<div>
			<h1>
				<xsl:choose>
					<xsl:when test="isd:DocumentType=1">{{docType1}}</xsl:when>
					<xsl:when test="isd:DocumentType=2">{{docType2}}</xsl:when>
					<xsl:when test="isd:DocumentType=3">{{docType3}}</xsl:when>
					<xsl:when test="isd:DocumentType=4">{{docType4}}</xsl:when>
					<xsl:when test="isd:DocumentType=5">{{docType5}}</xsl:when>
					<xsl:when test="isd:DocumentType=6">{{docType6}}</xsl:when>
					<xsl:when test="isd:DocumentType=7">{{docType7}}</xsl:when>
					<xsl:otherwise>{{docTypeOther}}</xsl:otherwise>
				</xsl:choose>
			</h1>
			<xsl:if test="isd:VATApplicable='false'"><div class="sub">{{nonVat}}</div></xsl:if>
		</div>
		<div class="no"><span class="sub">{{invoiceNo}} </span><xsl:value-of select="isd:ID"/></div>
	</div>

	<div class="parties">
		<div class="party">
			<h2>{{supplier}}</h2>
			<xsl:apply-templates select="isd:AccountingSupplierParty/isd:Party"/>
		</div>
		<div class="party">
			<h2>{{customer}}</h2>
			<xsl:apply-templates select="isd:AccountingCustomerParty/isd:Party"/>
		</div>
	</div>

	<div class="meta">
		<div><span>{{issueDate}}: </span><xsl:call-template name="date"><xsl:with-param name="d" select="isd:IssueDate"/></xsl:call-template></div>
		<xsl:if test="isd:TaxPointDate">
			<div><span>{{taxPointDate}}: </span><xsl:call-template name="date"><xsl:with-param name="d" select="isd:TaxPointDate"/></xsl:call-template></div>
		</xsl:if>
		<xsl:for-each select="isd:PaymentMeans/isd:Payment/isd:Details/isd:PaymentDueDate[normalize-space(.)!=''][1]">
			<div><span>{{dueDate}}: </span><b><xsl:call-template name="date"><xsl:with-param name="d" select="."/></xsl:call-template></b></div>
		</xsl:for-each>
		<xsl:if test="$foreign">
			<div><span>{{rate}}: </span><xsl:call-template name="num"><xsl:with-param name="v" select="isd:CurrRate div isd:RefCurrRate"/><xsl:with-param name="f" select="'{{pRate}}'"/></xsl:call-template>
				<xsl:text> </xsl:text><xsl:value-of select="$cur"/> / 1 <xsl:value-of select="$foreign"/></div>
		</xsl:if>
		<xsl:if test="isd:OriginalDocumentReference/isd:ID">
			<div><span>{{forDoc}}: </span><xsl:value-of select="isd:OriginalDocumentReference/isd:ID"/></div>
		</xsl:if>
	</div>

	<xsl:apply-templates select="isd:InvoiceLines"/>

	<div class="row2">
		<div class="pay">
			<h2>{{payment}}</h2>
			<xsl:apply-templates select="isd:PaymentMeans"/>
			<xsl:if test="$qrSpayd != '' or $qrEpc != ''">
				<div class="qrs">
					<xsl:if test="$qrSpayd != ''">
						<div class="qr"><img alt="QR" src="{$qrSpayd}"/>{{qrSpayd}}</div>
					</xsl:if>
					<xsl:if test="$qrEpc != ''">
						<div class="qr"><img alt="QR" src="{$qrEpc}"/>{{qrEpc}}</div>
					</xsl:if>
				</div>
			</xsl:if>
		</div>
		<div class="sum">
			<table>
				<tr class="hd"><td>{{vatRateFull}}</td><td class="r">{{base}}</td><td class="r">{{vat}}</td><td class="r">{{total}}</td></tr>
				<xsl:for-each select="isd:TaxTotal/isd:TaxSubTotal">
					<tr>
						<td><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxCategory/isd:Percent"/><xsl:with-param name="f" select="'{{pPct}}'"/></xsl:call-template> %</td>
						<td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxableAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
						<td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
						<td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxInclusiveAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
					</tr>
				</xsl:for-each>
				<xsl:apply-templates select="isd:LegalMonetaryTotal"/>
			</table>
		</div>
	</div>

	<xsl:if test="normalize-space(isd:Note)!=''">
		<div class="notes"><xsl:value-of select="isd:Note"/></div>
	</xsl:if>

	<xsl:apply-templates select="isd:OrderReferences[isd:OrderReference]"/>
	<xsl:apply-templates select="isd:DeliveryNoteReferences[isd:DeliveryNoteReference]"/>
</div>
</xsl:template>

<xsl:template match="isd:Party">
	<div class="name"><xsl:value-of select="isd:PartyName/isd:Name"/></div>
	<div>
		<xsl:value-of select="isd:PostalAddress/isd:StreetName"/>
		<xsl:if test="normalize-space(isd:PostalAddress/isd:BuildingNumber)!=''">
			<xsl:text> </xsl:text><xsl:value-of select="isd:PostalAddress/isd:BuildingNumber"/>
		</xsl:if>
	</div>
	<div><xsl:value-of select="isd:PostalAddress/isd:PostalZone"/><xsl:text> </xsl:text><xsl:value-of select="isd:PostalAddress/isd:CityName"/></div>
	<div><xsl:value-of select="isd:PostalAddress/isd:Country/isd:IdentificationCode"/></div>
	<div class="ids">
		<xsl:if test="normalize-space(isd:PartyIdentification/isd:ID)!=''"><div><span>{{companyId}}:</span> <xsl:value-of select="isd:PartyIdentification/isd:ID"/></div></xsl:if>
		<xsl:if test="normalize-space(isd:PartyTaxScheme/isd:CompanyID)!=''"><div><span>{{vatId}}:</span> <xsl:value-of select="isd:PartyTaxScheme/isd:CompanyID"/></div></xsl:if>
	</div>
	<xsl:if test="isd:Contact[normalize-space(isd:Name)!='' or normalize-space(isd:Telephone)!='' or normalize-space(isd:ElectronicMail)!='']">
		<div class="contact">
			<xsl:for-each select="isd:Contact/isd:Name[normalize-space(.)!='']"><div><xsl:value-of select="."/></div></xsl:for-each>
			<xsl:for-each select="isd:Contact/isd:Telephone[normalize-space(.)!='']"><div>{{tel}}: <xsl:value-of select="."/></div></xsl:for-each>
			<xsl:for-each select="isd:Contact/isd:ElectronicMail[normalize-space(.)!='']"><div><xsl:value-of select="."/></div></xsl:for-each>
		</div>
	</xsl:if>
</xsl:template>

<xsl:template match="isd:InvoiceLines">
	<table class="lines">
		<tr>
			<th>{{item}}</th>
			<th class="r">{{qty}}</th>
			<th class="r">{{vatRate}}</th>
			<th class="r">{{base}}</th>
			<th class="r">{{vat}}</th>
			<th class="r">{{total}}</th>
		</tr>
		<xsl:for-each select="isd:InvoiceLine">
			<tr>
				<td>
					<xsl:value-of select="isd:Item/isd:Description"/>
					<xsl:if test="normalize-space(isd:Note)!=''"><div class="note"><xsl:value-of select="isd:Note"/></div></xsl:if>
				</td>
				<td class="r">
					<xsl:if test="isd:InvoicedQuantity != 0">
						<xsl:call-template name="num"><xsl:with-param name="v" select="isd:InvoicedQuantity"/><xsl:with-param name="f" select="$nfQty"/></xsl:call-template>
						<xsl:if test="isd:InvoicedQuantity/@unitCode"><xsl:text> </xsl:text><xsl:value-of select="isd:InvoicedQuantity/@unitCode"/></xsl:if>
					</xsl:if>
				</td>
				<td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:ClassifiedTaxCategory/isd:Percent"/><xsl:with-param name="f" select="'{{pPct}}'"/></xsl:call-template> %</td>
				<td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:LineExtensionAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
				<td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:LineExtensionTaxAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
				<td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:LineExtensionAmountTaxInclusive"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
			</tr>
		</xsl:for-each>
	</table>
</xsl:template>

<xsl:template match="isd:LegalMonetaryTotal">
	<tr>
		<td colspan="1"><b>{{total}}</b></td>
		<td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxExclusiveAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
		<td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxInclusiveAmount - isd:TaxExclusiveAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
		<td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:TaxInclusiveAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td>
	</tr>
	<xsl:if test="isd:PayableRoundingAmount != 0">
		<tr><td colspan="3">{{rounding}}</td><td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:PayableRoundingAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td></tr>
	</xsl:if>
	<xsl:if test="isd:PaidDepositsAmount != 0">
		<tr><td colspan="3">{{paidDeposits}}</td><td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:PaidDepositsAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template></td></tr>
	</xsl:if>
	<tr class="tot">
		<td colspan="3">{{toPay}}</td>
		<td class="r">
			<xsl:call-template name="num"><xsl:with-param name="v" select="isd:PayableAmount"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template><xsl:text> </xsl:text><xsl:value-of select="$cur"/>
		</td>
	</tr>
	<xsl:if test="$foreign and isd:PayableAmountCurr">
		<tr>
			<td colspan="3"/>
			<td class="r"><xsl:call-template name="num"><xsl:with-param name="v" select="isd:PayableAmountCurr"/><xsl:with-param name="f" select="$nfMoney"/></xsl:call-template><xsl:text> </xsl:text><xsl:value-of select="$foreign"/></td>
		</tr>
	</xsl:if>
</xsl:template>

<xsl:template match="isd:PaymentMeans">
	<xsl:for-each select="isd:Payment">
		<table>
			<tr><td>{{payMethod}}</td><td>
				<xsl:choose>
					<xsl:when test="isd:PaymentMeansCode=10">{{pm10}}</xsl:when>
					<xsl:when test="isd:PaymentMeansCode=20">{{pm20}}</xsl:when>
					<xsl:when test="isd:PaymentMeansCode=31">{{pm31}}</xsl:when>
					<xsl:when test="isd:PaymentMeansCode=42">{{pm42}}</xsl:when>
					<xsl:when test="isd:PaymentMeansCode=48">{{pm48}}</xsl:when>
					<xsl:when test="isd:PaymentMeansCode=49">{{pm49}}</xsl:when>
					<xsl:when test="isd:PaymentMeansCode=50">{{pm50}}</xsl:when>
					<xsl:when test="isd:PaymentMeansCode=97">{{pm97}}</xsl:when>
					<xsl:otherwise>{{pmCode}} <xsl:value-of select="isd:PaymentMeansCode"/></xsl:otherwise>
				</xsl:choose>
			</td></tr>
			<xsl:if test="normalize-space(isd:Details/isd:ID)!=''">
				<tr><td>{{accountNo}}</td><td><xsl:value-of select="isd:Details/isd:ID"/>/<xsl:value-of select="isd:Details/isd:BankCode"/></td></tr>
			</xsl:if>
			<xsl:if test="normalize-space(isd:Details/isd:Name)!=''"><tr><td>{{bank}}</td><td><xsl:value-of select="isd:Details/isd:Name"/></td></tr></xsl:if>
			<xsl:if test="normalize-space(isd:Details/isd:IBAN)!=''"><tr><td>IBAN</td><td><xsl:value-of select="isd:Details/isd:IBAN"/></td></tr></xsl:if>
			<xsl:if test="normalize-space(isd:Details/isd:BIC)!=''"><tr><td>BIC</td><td><xsl:value-of select="isd:Details/isd:BIC"/></td></tr></xsl:if>
			<xsl:if test="normalize-space(isd:Details/isd:VariableSymbol)!=''"><tr><td>{{vs}}</td><td><xsl:value-of select="isd:Details/isd:VariableSymbol"/></td></tr></xsl:if>
			<xsl:if test="normalize-space(isd:Details/isd:ConstantSymbol)!=''"><tr><td>{{ks}}</td><td><xsl:value-of select="isd:Details/isd:ConstantSymbol"/></td></tr></xsl:if>
			<xsl:if test="normalize-space(isd:Details/isd:SpecificSymbol)!=''"><tr><td>{{ss}}</td><td><xsl:value-of select="isd:Details/isd:SpecificSymbol"/></td></tr></xsl:if>
			<xsl:if test="normalize-space(isd:Details/isd:DocumentID)!=''"><tr><td>{{document}}</td><td><xsl:value-of select="isd:Details/isd:DocumentID"/></td></tr></xsl:if>
		</table>
	</xsl:for-each>
</xsl:template>

<xsl:template match="isd:OrderReferences">
	<div class="ref">
		<h2>{{orders}}</h2>
		<table>
			<tr><th>{{number}}</th><th>{{date}}</th><th>{{extNumber}}</th></tr>
			<xsl:for-each select="isd:OrderReference">
				<tr>
					<td><xsl:value-of select="isd:SalesOrderID"/></td>
					<td><xsl:call-template name="date"><xsl:with-param name="d" select="isd:IssueDate"/></xsl:call-template></td>
					<td><xsl:value-of select="isd:ExternalOrderID"/></td>
				</tr>
			</xsl:for-each>
		</table>
	</div>
</xsl:template>

<xsl:template match="isd:DeliveryNoteReferences">
	<div class="ref">
		<h2>{{deliveryNotes}}</h2>
		<table>
			<tr><th>{{number}}</th><th>{{date}}</th></tr>
			<xsl:for-each select="isd:DeliveryNoteReference">
				<tr>
					<td><xsl:value-of select="isd:ID"/></td>
					<td><xsl:call-template name="date"><xsl:with-param name="d" select="isd:IssueDate"/></xsl:call-template></td>
				</tr>
			</xsl:for-each>
		</table>
	</div>
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
