import assert from "node:assert/strict";

import { contentManifest, getArticleMetadata } from "../lib/content-manifest.ts";
import { getArticleStructuredData, serializeStructuredData, siteStructuredData, siteUrl } from "../lib/seo.ts";

const articles = contentManifest.filter((entry) => entry.kind === "article");
const pages = [{ href: "/" }, ...contentManifest.filter((entry) => entry.kind !== "external")];
const authorId = `${siteUrl}/#author`;
const siteId = `${siteUrl}/#website`;

assert.equal(siteStructuredData["@graph"].find((entry) => entry["@type"] === "Person")["@id"], authorId);
assert.equal(siteStructuredData["@graph"].find((entry) => entry["@type"] === "WebSite")["@id"], siteId);

for (const article of articles) {
  const metadata = getArticleMetadata(article.id);
  assert.equal(metadata.title, article.metadataTitle);
  assert.equal(metadata.description, article.description);
  assert.equal(metadata.alternates.canonical, article.href);
  const structuredData = getArticleStructuredData(article);
  assert.equal(structuredData.url, new URL(article.href, siteUrl).href);
  assert.equal(structuredData.headline, article.articleTitle.zh);
  assert.equal(structuredData.author["@id"], authorId);
  assert.equal(structuredData.isPartOf["@id"], siteId);
  assert(!("datePublished" in structuredData));
  assert(!("dateModified" in structuredData));
  assert.deepEqual(JSON.parse(serializeStructuredData(structuredData)), structuredData);
}

// A title copied from research content must never close the inert JSON-LD script.
const untrusted = { headline: '</script><script>alert("title")</script> & 中文' };
const serialized = serializeStructuredData(untrusted);
assert(!serialized.includes("<"));
assert.deepEqual(JSON.parse(serialized), untrusted);

const baseIndex = process.argv.indexOf("--base-url");
if (baseIndex !== -1) {
  const base = process.argv[baseIndex + 1];
  assert(base, "--base-url requires a running build's URL");
  const sitemapResponse = await fetch(new URL("/sitemap.xml", base));
  assert.equal(sitemapResponse.status, 200);
  assert.match(sitemapResponse.headers.get("content-type"), /xml/);
  const sitemapText = await sitemapResponse.text();
  const sitemapUrls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expectedUrls = pages.map((page) => new URL(page.href, siteUrl).href);
  assert.deepEqual(sitemapUrls.toSorted(), expectedUrls.toSorted());
  assert.equal(new Set(sitemapUrls).size, 14);
  assert(!sitemapText.includes("<lastmod>"));

  const robotsResponse = await fetch(new URL("/robots.txt", base));
  assert.equal(robotsResponse.status, 200);
  assert.match(robotsResponse.headers.get("content-type"), /text\/plain/);
  const robotsText = await robotsResponse.text();
  assert.match(robotsText, /User-Agent: \*/i);
  assert.match(robotsText, /^Allow: \/$/m);
  assert(!/^Disallow:/m.test(robotsText));
  assert(robotsText.includes(`Sitemap: ${siteUrl}/sitemap.xml`));

  for (const page of pages) {
    // Tracking parameters must not become part of the canonical or JSON-LD URL.
    const response = await fetch(new URL(`${page.href}?utm_source=seo-check`, base));
    assert.equal(response.status, 200, page.href);
    const html = await response.text();
    const canonicals = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"[^>]*>/g)];
    assert.equal(canonicals.length, 1, page.href);
    assert.equal(canonicals[0][1], new URL(page.href, siteUrl).href);
    const schemas = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1]));
    assert(schemas.some((schema) => schema["@graph"]?.some((entity) => entity["@type"] === "WebSite")), page.href);
    const article = articles.find((entry) => entry.href === page.href);
    const articleSchemas = schemas.filter((schema) => schema["@type"] === "Article");
    assert.equal(articleSchemas.length, article ? 1 : 0, page.href);
    if (article) assert.deepEqual(articleSchemas[0], getArticleStructuredData(article));
  }
  const missing = await fetch(new URL("/seo-missing-page/", base));
  assert.equal(missing.status, 404);
  assert(!/rel="canonical"/.test(await missing.text()), "404 must not inherit the homepage canonical");
  console.log("built SEO routes: 14 canonicals, JSON-LD, sitemap, robots, tracking URLs and 404 passed");
}

console.log("SEO metadata and JSON-LD checks passed");
