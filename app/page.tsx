import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";

import { HomePageContent } from "@/components/home-page";

export const metadata: Metadata = {
  title: "Agora — Key Takeaways | Agora Equity Research",
  description: "Agora's core investment thesis, RTC market dynamics, and competitive position.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const articleDirectory = path.join(process.cwd(), "articles", "声网-主要观点");
  const [zhMarkdown, enMarkdown] = await Promise.all([
    readFile(path.join(articleDirectory, "声网-主要观点.md"), "utf8"),
    readFile(path.join(articleDirectory, "Agora-Key-Takeaways.md"), "utf8"),
  ]);

  return <HomePageContent enMarkdown={enMarkdown} zhMarkdown={zhMarkdown} />;
}
