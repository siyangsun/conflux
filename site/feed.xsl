<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:a="http://www.w3.org/2005/Atom">
<xsl:output method="html" encoding="utf-8"/>
<xsl:template match="/a:feed">
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title><xsl:value-of select="a:title"/></title>
<style>:root{color-scheme:light dark}body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem}p.note{opacity:.6}li{margin:.4rem 0}time{opacity:.6;font-size:.85em}</style>
</head><body>
<h1><xsl:value-of select="a:title"/></h1>
<p class="note">Copy this page's URL into a feed reader to subscribe.</p>
<ul><xsl:for-each select="a:entry"><li><a href="{a:link/@href}"><xsl:value-of select="a:title"/></a> <time><xsl:value-of select="substring(a:published,1,10)"/></time></li></xsl:for-each></ul>
</body></html>
</xsl:template>
</xsl:stylesheet>
