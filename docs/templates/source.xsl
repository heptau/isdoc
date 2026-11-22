<?xml version="1.0" encoding="utf-8"?>
<!--
  "Source code" variant: prints the input XML indented and colorized (like an editor with syntax highlighting).
  Works on the original document (see raw in js/templates.js); independent of the invoice language and of QR.
  Contains no {{key}} placeholders except the page language code.
-->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

<xsl:output method="html" encoding="utf-8" indent="no"/>

<xsl:variable name="sp" select="'                                                                                                                                '"/>

<xsl:template match="/">
<html lang="{{code}}">
<head>
	<meta charset="utf-8"/>
	<title>XML</title>
	<style>
		:root{--bg:#fff;--fg:#1f2328;--punct:#6e7781;--tag:#116329;--attr:#0550ae;--val:#0a3069;--cmt:#6e7781;--pi:#8250df;--ln:#8c959f;--line:#d0d7de}
		:root[data-theme="dark"]{--bg:#0d1117;--fg:#e6edf3;--punct:#8b949e;--tag:#7ee787;--attr:#79c0ff;--val:#a5d6ff;--cmt:#8b949e;--pi:#d2a8ff;--ln:#6e7681;--line:#30363d}
		@media (prefers-color-scheme:dark){:root:not([data-theme]){--bg:#0d1117;--fg:#e6edf3;--punct:#8b949e;--tag:#7ee787;--attr:#79c0ff;--val:#a5d6ff;--cmt:#8b949e;--pi:#d2a8ff;--ln:#6e7681;--line:#30363d}}
		html,body{margin:0;background:var(--bg);color:var(--fg)}
		.code{counter-reset:ln;padding:10px 0;font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}
		.l{counter-increment:ln;white-space:pre-wrap;word-break:break-all;padding:0 12px 0 56px;position:relative}
		.l::before{content:counter(ln);position:absolute;left:0;width:44px;text-align:right;color:var(--ln);border-right:1px solid var(--line);padding-right:6px;user-select:none}
		.p{color:var(--punct)} .t{color:var(--tag)} .a{color:var(--attr)} .v{color:var(--val)}
		.c{color:var(--cmt);font-style:italic} .i{color:var(--pi)}
	</style>
</head>
<body><div class="code"><xsl:apply-templates select="node()"/></div></body>
</html>
</xsl:template>

<!-- Element -->
<xsl:template match="*">
	<xsl:variable name="ind" select="substring($sp,1,2*count(ancestor::*))"/>
	<xsl:choose>
		<xsl:when test="not(node())">
			<div class="l"><xsl:value-of select="$ind"/><xsl:call-template name="open"/><span class="p">/&gt;</span></div>
		</xsl:when>
		<xsl:when test="not(*|comment()|processing-instruction())">
			<div class="l"><xsl:value-of select="$ind"/><xsl:call-template name="open"/><span class="p">&gt;</span><xsl:call-template name="esc"><xsl:with-param name="s" select="string(.)"/></xsl:call-template><span class="p">&lt;/</span><span class="t"><xsl:value-of select="name()"/></span><span class="p">&gt;</span></div>
		</xsl:when>
		<xsl:otherwise>
			<div class="l"><xsl:value-of select="$ind"/><xsl:call-template name="open"/><span class="p">&gt;</span></div>
			<xsl:apply-templates select="*|comment()|processing-instruction()|text()[normalize-space()]"/>
			<div class="l"><xsl:value-of select="$ind"/><span class="p">&lt;/</span><span class="t"><xsl:value-of select="name()"/></span><span class="p">&gt;</span></div>
		</xsl:otherwise>
	</xsl:choose>
</xsl:template>

<!-- Start of a tag: <name xmlns... attributes -->
<xsl:template name="open">
	<span class="p">&lt;</span><span class="t"><xsl:value-of select="name()"/></span>
	<xsl:variable name="el" select="."/>
	<xsl:for-each select="namespace::*[name()!='xml']">
		<xsl:variable name="pfx" select="name()"/>
		<xsl:variable name="uri" select="string(.)"/>
		<xsl:if test="not($el/parent::*/namespace::*[name()=$pfx][string(.)=$uri])">
			<xsl:text> </xsl:text>
			<span class="a"><xsl:choose><xsl:when test="$pfx=''">xmlns</xsl:when><xsl:otherwise>xmlns:<xsl:value-of select="$pfx"/></xsl:otherwise></xsl:choose></span><span class="p">=</span><span class="v">"<xsl:call-template name="esc"><xsl:with-param name="s" select="$uri"/><xsl:with-param name="q" select="1"/></xsl:call-template>"</span>
		</xsl:if>
	</xsl:for-each>
	<xsl:for-each select="@*">
		<xsl:text> </xsl:text>
		<span class="a"><xsl:value-of select="name()"/></span><span class="p">=</span><span class="v">"<xsl:call-template name="esc"><xsl:with-param name="s" select="string(.)"/><xsl:with-param name="q" select="1"/></xsl:call-template>"</span>
	</xsl:for-each>
</xsl:template>

<!-- Text between elements -->
<xsl:template match="text()">
	<div class="l"><xsl:value-of select="substring($sp,1,2*count(ancestor::*))"/><xsl:call-template name="esc"><xsl:with-param name="s" select="normalize-space(.)"/></xsl:call-template></div>
</xsl:template>

<xsl:template match="comment()">
	<div class="l c"><xsl:value-of select="substring($sp,1,2*count(ancestor::*))"/>&lt;!--<xsl:value-of select="."/>--&gt;</div>
</xsl:template>

<xsl:template match="processing-instruction()">
	<div class="l i"><xsl:value-of select="substring($sp,1,2*count(ancestor::*))"/>&lt;?<xsl:value-of select="name()"/><xsl:text> </xsl:text><xsl:value-of select="."/>?&gt;</div>
</xsl:template>

<!-- Escaping of & < > (and " in attributes), as in real XML source -->
<xsl:template name="esc">
	<xsl:param name="s"/>
	<xsl:param name="q" select="0"/>
	<xsl:variable name="a">
		<xsl:call-template name="rep"><xsl:with-param name="s" select="$s"/><xsl:with-param name="f" select="'&amp;'"/><xsl:with-param name="r" select="'&amp;amp;'"/></xsl:call-template>
	</xsl:variable>
	<xsl:variable name="b">
		<xsl:call-template name="rep"><xsl:with-param name="s" select="string($a)"/><xsl:with-param name="f" select="'&lt;'"/><xsl:with-param name="r" select="'&amp;lt;'"/></xsl:call-template>
	</xsl:variable>
	<xsl:variable name="c">
		<xsl:call-template name="rep"><xsl:with-param name="s" select="string($b)"/><xsl:with-param name="f" select="'&gt;'"/><xsl:with-param name="r" select="'&amp;gt;'"/></xsl:call-template>
	</xsl:variable>
	<xsl:choose>
		<xsl:when test="$q = 1">
			<xsl:call-template name="rep"><xsl:with-param name="s" select="string($c)"/><xsl:with-param name="f" select="'&quot;'"/><xsl:with-param name="r" select="'&amp;quot;'"/></xsl:call-template>
		</xsl:when>
		<xsl:otherwise><xsl:value-of select="$c"/></xsl:otherwise>
	</xsl:choose>
</xsl:template>

<!-- Replaces the character f with the string r. Long text is halved, so recursion depth stays small even with
     thousands of occurrences (plain one-occurrence-at-a-time recursion would overflow the stack). f is always a single character. -->
<xsl:template name="rep">
	<xsl:param name="s"/>
	<xsl:param name="f"/>
	<xsl:param name="r"/>
	<xsl:choose>
		<xsl:when test="not(contains($s,$f))"><xsl:value-of select="$s"/></xsl:when>
		<xsl:when test="string-length($s) &gt; 24">
			<xsl:variable name="h" select="floor(string-length($s) div 2)"/>
			<xsl:call-template name="rep"><xsl:with-param name="s" select="substring($s,1,$h)"/><xsl:with-param name="f" select="$f"/><xsl:with-param name="r" select="$r"/></xsl:call-template>
			<xsl:call-template name="rep"><xsl:with-param name="s" select="substring($s,$h+1)"/><xsl:with-param name="f" select="$f"/><xsl:with-param name="r" select="$r"/></xsl:call-template>
		</xsl:when>
		<xsl:otherwise>
			<xsl:value-of select="substring-before($s,$f)"/><xsl:value-of select="$r"/>
			<xsl:call-template name="rep"><xsl:with-param name="s" select="substring-after($s,$f)"/><xsl:with-param name="f" select="$f"/><xsl:with-param name="r" select="$r"/></xsl:call-template>
		</xsl:otherwise>
	</xsl:choose>
</xsl:template>

</xsl:stylesheet>
