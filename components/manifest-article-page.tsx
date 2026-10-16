import { readFile } from "node:fs/promises";
import path from "node:path";

import { LocalizedMarkdownArticle } from "@/components/localized-markdown-article";
import { getArticle, type ArticleId } from "@/lib/content-manifest";
import { getArticleStructuredData, serializeStructuredData } from "@/lib/seo";

type ManifestArticlePageProps = {
  id: ArticleId;
};

export async function ManifestArticlePage({ id }: ManifestArticlePageProps) {
  const article = getArticle(id);
  const articleRoot = path.join(process.cwd(), "articles");
  const [zhMarkdown, enMarkdown] = await Promise.all([
    readFile(path.join(articleRoot, article.files.zh), "utf8"),
    readFile(path.join(articleRoot, article.files.en), "utf8"),
  ]);

  return (
    <>
      <LocalizedMarkdownArticle
        articleClassName={article.articleClassName}
        enMarkdown={enMarkdown}
        enTitle={article.articleTitle.en}
        zhMarkdown={zhMarkdown}
        zhTitle={article.articleTitle.zh}
      />
      <script
        id="article-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(getArticleStructuredData(article)) }}
      />
    </>
  );
}
