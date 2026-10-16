import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RTC Developer Ecosystem · Agora Equity Research",
  description: "Agora、LiveKit、Twilio 与腾讯 RTC 开发者软件包的公开周度下载趋势。",
  alternates: { canonical: "/Demand/Dev_npm_downloads/" },
};

export default function DevNpmDownloadsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
