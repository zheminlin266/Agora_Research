import type { MetadataRoute } from "next";

import { contentManifest } from "@/lib/content-manifest";
import { siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", ...contentManifest.filter((entry) => entry.kind !== "external").map((entry) => entry.href)]
    .map((href) => ({ url: new URL(href, siteUrl).href }));
}
