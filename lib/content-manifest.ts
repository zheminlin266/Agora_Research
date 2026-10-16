export type ContentLanguage = "zh" | "en";
export type NavigationSection = "demand" | "supply" | "agora" | "resources";
export type LocalizedText = Record<ContentLanguage, string>;

type BaseContentEntry = {
  id: string;
  section: NavigationSection;
  order: number;
  href: string;
  navTitle: LocalizedText;
};

export type ArticleId =
  | "rtc-industry-demand"
  | "us-livestream-commerce-growth"
  | "ai-voice-infrastructure"
  | "rtc-supply"
  | "ai-rtc-moats"
  | "openai-livekit-relationship"
  | "customer-scenarios-competitive-analysis"
  | "whatnot-agora-partnership"
  | "equity-ownership-share-repurchase"
  | "employee-headcount-changes"
  | "shanghai-headquarters-construction";

export type ArticleContentEntry = Omit<BaseContentEntry, "id"> & {
  id: ArticleId;
  kind: "article";
  articleTitle: LocalizedText;
  metadataTitle: string;
  description: string;
  files: LocalizedText;
  searchable: true;
  articleClassName?: string;
};

export type RouteContentEntry = BaseContentEntry & {
  kind: "route";
  searchable: false;
};

export type ExternalContentEntry = BaseContentEntry & {
  kind: "external";
  searchable: false;
};

export type ContentEntry = ArticleContentEntry | RouteContentEntry | ExternalContentEntry;

export const sectionLabels: Record<NavigationSection, LocalizedText> = {
  demand: { zh: "行业需求", en: "Demand" },
  supply: { zh: "行业供给", en: "Supply" },
  agora: { zh: "声网", en: "Agora" },
  resources: { zh: "资源", en: "Resources" },
};

export const navigationLabels: Record<"home" | NavigationSection, LocalizedText> = {
  home: { zh: "首页", en: "Home" },
  ...sectionLabels,
};

export const navigationSections: NavigationSection[] = ["demand", "supply", "agora", "resources"];

export const contentManifest: ContentEntry[] = [
  {
    id: "rtc-industry-demand",
    kind: "article",
    section: "demand",
    order: 1,
    href: "/Demand/RTC_industry_demand/",
    navTitle: { zh: "RTC行业需求", en: "RTC Industry Demand" },
    articleTitle: { zh: "RTC行业需求", en: "RTC Industry Demand" },
    metadataTitle: "RTC 行业需求 | Agora Equity Research",
    description: "RTC 行业需求场景、participant-minutes 规模与历史变化。",
    files: { zh: "RTC行业需求.md", en: "RTC Industry Demand.md" },
    searchable: true,
  },
  {
    id: "us-livestream-commerce-growth",
    kind: "article",
    section: "demand",
    order: 2,
    href: "/Demand/US_Livestream_Commerce_Growth/",
    navTitle: { zh: "美国直播电商增长情况", en: "U.S. Livestream Commerce Growth" },
    articleTitle: { zh: "美国直播电商增长情况", en: "U.S. Livestream Commerce Growth" },
    metadataTitle: "美国直播电商增长情况 | Agora Equity Research",
    description: "美国直播电商市场、Whatnot 与 TikTok Shop/Live 的增长情况。",
    files: { zh: "美国直播电商增长情况.md", en: "U.S. Livestream Commerce Growth.md" },
    searchable: true,
  },
  {
    id: "ai-voice-infrastructure",
    kind: "article",
    section: "demand",
    order: 3,
    href: "/Demand/AI_Voice_Infrastructure/",
    navTitle: { zh: "AI语音对基础设施需求的特性", en: "AI Voice Infrastructure Requirements" },
    articleTitle: { zh: "AI语音对基础设施需求的特性", en: "How AI Voice Changes Infrastructure Requirements" },
    metadataTitle: "AI语音对基础设施需求的特性 | Agora Equity Research",
    description: "AI语音与直播电商、社交直播在实时通信基础设施需求上的差异。",
    files: { zh: "AI语音对基础设施需求的特性.md", en: "Infrastructure Requirements for AI Voice.md" },
    searchable: true,
    articleClassName: "ai-voice-infrastructure",
  },
  {
    id: "dev-npm-downloads",
    kind: "route",
    section: "demand",
    order: 4,
    href: "/Demand/Dev_npm_downloads/",
    navTitle: { zh: "RTC开发者项目库下载量", en: "RTC Dev npm Download" },
    searchable: false,
  },
  {
    id: "rtc-supply",
    kind: "article",
    section: "supply",
    order: 1,
    href: "/Supply/RTC_supply/",
    navTitle: { zh: "RTC 行业供给", en: "RTC Industry Supply" },
    articleTitle: { zh: "RTC 行业供给", en: "RTC Industry Supply" },
    metadataTitle: "RTC 行业供给 | Agora Equity Research",
    description: "RTC 行业供给格局、进入与退出案例，以及 AI 对供给难度的影响。",
    files: { zh: "RTC行业供给.md", en: "RTC_industry_supply.en.md" },
    searchable: true,
  },
  {
    id: "ai-rtc-moats",
    kind: "article",
    section: "supply",
    order: 2,
    href: "/Supply/AI_RTC_moats/",
    navTitle: { zh: "AI对RTC业务护城河的影响", en: "Impact of AI on RTC Business Moats" },
    articleTitle: { zh: "AI对RTC业务护城河的影响", en: "Impact of AI on RTC Business Moats" },
    metadataTitle: "AI 对 RTC 业务护城河的影响 | Agora Equity Research",
    description: "AI 对 RTC 业务护城河与行业供给难度的影响分析。",
    files: { zh: "AI对RTC业务护城河的影响.md", en: "Impact_of_AI_on_RTC_Business_Moats.md" },
    searchable: true,
  },
  {
    id: "openai-livekit-relationship",
    kind: "article",
    section: "supply",
    order: 3,
    href: "/Supply/OpenAI_LiveKit_Relationship/",
    navTitle: { zh: "OpenAI 与 LiveKit 关系", en: "OpenAI and LiveKit Relationship" },
    articleTitle: {
      zh: "OpenAI 与 LiveKit：从 ChatGPT 语音模式共研，到语音代理基础设施生态",
      en: "OpenAI and LiveKit: From Co-Developing ChatGPT Voice to a Voice-Agent Infrastructure Ecosystem",
    },
    metadataTitle: "OpenAI 与 LiveKit 关系 | Agora Equity Research",
    description: "复盘 OpenAI AI 语音发展与 LiveKit 演进，以及双方合作关系的变化。",
    files: { zh: "OpenAI与LiveKit关系.md", en: "OpenAI and LiveKit Relationship.md" },
    searchable: true,
  },
  {
    id: "customer-scenarios-competitive-analysis",
    kind: "article",
    section: "agora",
    order: 1,
    href: "/Agora/Customer_Scenarios_Competitive_Analysis/",
    navTitle: { zh: "声网生存空间和迁移案例", en: "Agora's Competitive Space & Migration Cases" },
    articleTitle: { zh: "声网生存空间和迁移案例", en: "Agora's Competitive Space and Migration Cases" },
    metadataTitle: "声网生存空间和迁移案例 | Agora Equity Research",
    description: "Agora 客户工作负载、买入与自建决策，以及客户迁入迁出的竞争分析，聚焦声网的生存空间和迁移案例。",
    files: { zh: "声网客户场景和竞争分析.md", en: "agora_customer_scenarios_and_competitive_analysis.md" },
    searchable: true,
  },
  {
    id: "whatnot-agora-partnership",
    kind: "article",
    section: "agora",
    order: 2,
    href: "/Agora/Whatnot_Agora_Partnership/",
    navTitle: { zh: "Whatnot & Agora直播合作", en: "Whatnot & Agora Livestream Partnership" },
    articleTitle: { zh: "Whatnot & Agora直播合作案例", en: "Whatnot & Agora Livestream Partnership" },
    metadataTitle: "Whatnot 与 Agora 直播合作 | Agora Equity Research",
    description: "Whatnot 与 Agora 在超大规模实时直播中的合作案例。",
    files: { zh: "Whatnot & Agora直播合作.md", en: "Whatnot & Agora Livestream Partnership.md" },
    searchable: true,
  },
  {
    id: "equity-ownership-share-repurchase",
    kind: "article",
    section: "agora",
    order: 3,
    href: "/Agora/Equity_Ownership_Share_Repurchase_Analysis/",
    navTitle: { zh: "股权结构与回购分析", en: "Equity Ownership & Share Repurchase Analysis" },
    articleTitle: { zh: "股权结构与回购分析", en: "Equity Ownership and Share Repurchase Analysis" },
    metadataTitle: "股权结构与回购分析 | Agora Equity Research",
    description: "声网股权结构、主要股东、股份回购与潜在卖压来源分析。",
    files: { zh: "股权结构与回购分析.md", en: "Equity Ownership and Share Repurchase Analysis.md" },
    searchable: true,
  },
  {
    id: "employee-headcount-changes",
    kind: "article",
    section: "agora",
    order: 4,
    href: "/Agora/Employee_Headcount_Changes/",
    navTitle: { zh: "员工人数变化", en: "Employee Headcount Changes" },
    articleTitle: { zh: "声网员工人数变化", en: "Agora Employee Headcount Changes" },
    metadataTitle: "声网员工人数变化 | Agora Equity Research",
    description: "Agora 2020—2025 年员工人数、岗位结构及组织收缩分析。",
    files: { zh: "员工人数变化.md", en: "employee_headcount_changes.md" },
    searchable: true,
  },
  {
    id: "shanghai-headquarters-construction",
    kind: "article",
    section: "agora",
    order: 5,
    href: "/Agora/Shanghai_Headquarters_Construction_Analysis/",
    navTitle: { zh: "上海总部建设分析", en: "Shanghai Headquarters Construction Analysis" },
    articleTitle: { zh: "上海总部建设分析", en: "Shanghai Headquarters Construction Analysis" },
    metadataTitle: "上海总部建设分析 | Agora Equity Research",
    description: "声网上海总部项目的土地成本、建设支出、潜在租金回报与项目融资条款分析。",
    files: { zh: "上海总部建设分析.md", en: "Shanghai_Headquarters_Construction_Analysis_EN.md" },
    searchable: true,
    articleClassName: "shanghai-headquarters-analysis",
  },
  {
    id: "agora-key-metrics",
    kind: "route",
    section: "resources",
    order: 1,
    href: "/Resources/Agora_Key_Metrics/",
    navTitle: { zh: "声网核心数据", en: "Agora Key Metrics" },
    searchable: false,
  },
  {
    id: "rtc-learning-materials",
    kind: "external",
    section: "resources",
    order: 2,
    href: "https://github.com/zheminlin266/Agora_Research/tree/main/Resources",
    navTitle: { zh: "RTC Learning Materials", en: "RTC Learning Materials" },
    searchable: false,
  },
];

export function getArticle(id: ArticleId): ArticleContentEntry {
  const entry = contentManifest.find((candidate): candidate is ArticleContentEntry => candidate.kind === "article" && candidate.id === id);
  if (!entry) throw new Error(`Unknown article manifest id: ${id}`);
  return entry;
}

export function getArticleMetadata(id: ArticleId) {
  const entry = getArticle(id);
  return {
    title: entry.metadataTitle,
    description: entry.description,
    alternates: { canonical: entry.href },
  };
}

export function getSearchArticles(): ArticleContentEntry[] {
  return contentManifest.filter((entry): entry is ArticleContentEntry => entry.kind === "article" && entry.searchable);
}

export function getNavigationMenu(language: ContentLanguage) {
  return Object.fromEntries(navigationSections.map((section) => [
    section,
    contentManifest
      .filter((entry) => entry.section === section)
      .sort((left, right) => left.order - right.order)
      .map((entry) => ({ title: entry.navTitle[language], href: entry.href })),
  ])) as Record<NavigationSection, Array<{ title: string; href: string }> >;
}
