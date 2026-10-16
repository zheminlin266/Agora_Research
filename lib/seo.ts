import type { ArticleContentEntry } from "./content-manifest";

export const siteUrl = "https://agora.zhemin.ltd";

const author = {
  "@type": "Person",
  "@id": `${siteUrl}/#author`,
  name: "Zhemin",
  url: "https://www.zhemin.ltd",
};

export const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: "Agora Equity Research",
      inLanguage: "zh-CN",
      publisher: { "@id": author["@id"] },
    },
    author,
  ],
};

export function getArticleStructuredData(
  article: Pick<ArticleContentEntry, "href" | "articleTitle" | "description">,
) {
  const url = new URL(article.href, siteUrl).href;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    url,
    mainEntityOfPage: url,
    headline: article.articleTitle.zh,
    description: article.description,
    inLanguage: "zh-CN",
    author: { "@id": author["@id"] },
    isPartOf: { "@id": `${siteUrl}/#website` },
  };
}

export function serializeStructuredData(data: Record<string, unknown>) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
