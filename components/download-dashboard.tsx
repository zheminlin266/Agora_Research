"use client";

import { useEffect, useMemo, useState, type PointerEvent } from "react";

import { SiteHeader } from "@/components/site-header";
import { useSitePreferences, type Language } from "@/components/site-preferences";
import {
  parseDashboardManifest,
  parseDownloadDataset,
  type DashboardManifest,
  type DownloadRow,
} from "@/lib/download-data";

type RangeKey = "1y" | "3y" | "all";
type VendorKey = "agora" | "livekit" | "twilio" | "tencent";
type DatasetKey = string;
type DataRow = DownloadRow;
type LoadedDataset = {
  rows: DataRow[];
  registry: string;
  completeWeek: string;
  sharedCompleteWeek?: string;
};

const manifestPath = "/data/dev-npm-downloads/manifest.json";

const packagePresentations: Array<{
  key: string;
  label: string;
  description: Record<Language, string>;
}> = [
  { key: "agora-rtc-sdk-ng", label: "agora-rtc-sdk-ng", description: { zh: "浏览器实时音视频 Web SDK，用于视频会议、互动直播、语音通话和在线课堂等低延迟场景。", en: "Browser RTC SDK for low-latency video meetings, interactive streaming, voice calls, and online classrooms." } },
  { key: "agora-rtm-sdk", label: "agora-rtm-sdk", description: { zh: "实时消息 SDK，用于频道信令、聊天、在线状态与呼叫邀请，常与 RTC 音视频能力配合。", en: "Real-time messaging SDK for channel signaling, chat, presence, and call invitations alongside RTC media." } },
  { key: "agora-rtc-react", label: "agora-rtc-react", description: { zh: "React 封装与组件，用于在 React 应用中快速接入音视频房间、设备管理和通话状态。", en: "React bindings and components for adding media rooms, device controls, and call state to React applications." } },
  { key: "react-native-agora", label: "react-native-agora", description: { zh: "React Native RTC SDK，用于 iOS、Android 跨平台应用中的语音通话、视频会议和直播互动。", en: "React Native RTC SDK for voice calls, video meetings, and interactive streaming on iOS and Android." } },
  { key: "agora-token-builder", label: "agora-token-builder", description: { zh: "Python Token 生成工具，用于服务端签发 RTC、RTM 鉴权令牌，控制用户加入频道与访问权限。", en: "Python token builder for issuing RTC and RTM credentials and controlling channel access from a server." } },
  { key: "agora-python-server-sdk", label: "agora-python-server-sdk", description: { zh: "Python 服务端 SDK，用于后台管理房间、用户及云端能力，适合自动化服务和业务后端集成。", en: "Python server SDK for managing rooms, users, and cloud capabilities in automated services and backends." } },
  { key: "livekit-client", label: "livekit-client", description: { zh: "JavaScript、TypeScript 核心客户端，用于浏览器或 Node.js 接入房间、音视频轨道和实时数据。", en: "Core JavaScript and TypeScript client for rooms, media tracks, and real-time data in browsers or Node.js." } },
  { key: "@livekit/components-react", label: "livekit/components-react", description: { zh: "LiveKit React UI 组件，用于快速搭建视频会议、语音房间、设备控制和参与者界面。", en: "React UI components for quickly building video meetings, voice rooms, device controls, and participant views." } },
  { key: "@livekit/react-native", label: "livekit/react-native", description: { zh: "LiveKit React Native SDK，用于 iOS、Android 跨平台应用中的实时音视频房间与数据通信。", en: "React Native SDK for real-time media rooms and data communication on iOS and Android." } },
  { key: "@livekit/agents", label: "livekit/agents", description: { zh: "JavaScript、TypeScript Agent 框架，用于构建实时语音 AI、电话机器人及低延迟多模态交互服务。", en: "JavaScript and TypeScript agent framework for real-time voice AI, phone agents, and low-latency multimodal services." } },
  { key: "@livekit/agents-plugin-silero", label: "livekit/agents-plugin-silero", description: { zh: "LiveKit Agents 的 Silero VAD 插件，用于检测用户开始或停止说话，改善语音 Agent 轮次切换。", en: "Silero VAD plugin for LiveKit Agents that detects speech boundaries and improves conversational turn-taking." } },
  { key: "livekit", label: "livekit", description: { zh: "Python 实时 SDK，用于后端或 Agent 服务处理房间、音视频轨道、数据消息与实时任务。", en: "Python real-time SDK for handling rooms, media tracks, data messages, and live tasks in backend or agent services." } },
  { key: "livekit-api", label: "livekit-api", description: { zh: "Python 服务端 API 客户端，用于创建房间、管理参与者、生成令牌及调用云端管理接口。", en: "Python server API client for creating rooms, managing participants, issuing tokens, and calling cloud management APIs." } },
  { key: "livekit-agents", label: "livekit-agents", description: { zh: "Python Agents 框架，用于开发实时语音助手、呼叫机器人和接入 STT、LLM、TTS 的工作流。", en: "Python Agents framework for real-time voice assistants, calling agents, and STT, LLM, and TTS workflows." } },
  { key: "@twilio/voice-sdk", label: "twilio/voice-sdk", description: { zh: "浏览器与应用内语音通话 SDK，用于软电话、客服坐席、点击呼叫和 PSTN 通话控制。", en: "Browser and in-app voice SDK for softphones, contact center agents, click-to-call, and PSTN call control." } },
  { key: "twilio", label: "twilio", description: { zh: "Twilio Node.js 服务端库，用于短信、语音、视频及验证等 API 的鉴权、请求和后台自动化。", en: "Twilio Node.js server library for authentication, API requests, and backend automation across messaging, voice, video, and verification." } },
  { key: "trtc-cloud-js-sdk", label: "trtc-cloud-js-sdk", description: { zh: "腾讯 TRTC Web SDK，用于浏览器和 Electron 的视频会议、互动直播、语音通话及低延迟连麦。", en: "Tencent TRTC Web SDK for video meetings, interactive streaming, voice calls, and low-latency co-hosting in browsers and Electron." } },
];

type PackageDefinition = {
  key: string;
  label: string;
  description: Record<Language, string>;
  vendor: VendorKey;
  dataset: string;
};

function packageDefinitions(manifest: DashboardManifest): PackageDefinition[] {
  return manifest.packages.map((item) => {
    const presentation = packagePresentations.find((candidate) => candidate.key === item.key);
    if (!presentation) throw new Error(`Missing presentation for ${item.key}`);
    return {
      ...presentation,
      vendor: item.vendor as VendorKey,
      dataset: item.dataset,
    };
  });
}

const copy = {
  zh: {
    title: "RTC开发者项目库下载量",
    intro: "观察公开软件包下载量，理解实时互动产品的开发者采用变化。",
    caveat: "页面汇总 17 个 npm 与 PyPI 包，所有曲线按周聚合，并统一展示到最新完整周。下载量是生态活跃度的近似指标，不等同于客户数或商业收入。",
    refreshNotice: "2026-10-27 更新：PyPI 源数据已更新至 10 月 19 日当周。npm 官方统计出现多日缺口，本次保留原数据；图表仍统一截至 10 月 5 日当周，以保持比较口径一致。",
    refreshIssue: "npm 统计故障报告",
    summaryLabel: "数据范围",
    packages: "软件包",
    ecosystems: "生态",
    granularity: "粒度",
    week: "周",
    completeThrough: "完整周至",
    rangeTitle: "时间范围",
    rangeLabel: "选择图表时间范围",
    range: { "1y": "1 年", "3y": "3 年", all: "全部" },
    rangeDescription: { "1y": "最近 1 年", "3y": "最近 3 年", all: "全部历史" },
    loading: "正在读取周度数据…",
    partialFailure: "部分数据读取失败：",
    noData: "当前范围没有可用数据",
    latest: "最新周",
    yearOverYear: "同比",
    function: "功能与场景：",
    downloads: "次下载",
    vendorDescriptions: {
      agora: "Web、RTM、React、React Native 与 Python 服务端",
      livekit: "客户端、组件、React Native、Agents 与 Python API",
      twilio: "JavaScript Voice SDK 与通用服务端 SDK",
      tencent: "Web 与 Electron 实时音视频 SDK",
    },
    tencent: "腾讯 RTC",
    methodology: "口径与来源",
    methodOne: "npm 数据来自官方 Downloads API；PyPI 数据来自 ClickPy 公共 ClickHouse 数据集。CSV 保留最新未完成周，但本页图表和指标只使用完整周。",
    methodTwo: "npm 下载量会包含 CI、镜像、机器人、缓存和依赖安装；不同包之间也可能存在依赖重叠。因此图表更适合观察单个包的方向与持续性，不宜直接相加为客户规模。",
    backToTop: "返回顶部",
  },
  en: {
    title: "RTC Developer Ecosystem",
    intro: "Track public package downloads to understand changes in developer adoption across real-time engagement products.",
    caveat: "The dashboard covers 17 npm and PyPI packages. Every series is aggregated weekly and aligned to the latest complete week. Downloads approximate ecosystem activity; they do not equal customers or revenue.",
    refreshNotice: "Updated October 27, 2026: PyPI source data now covers the week of October 19. Recent npm statistics have gaps across multiple days, so the previous npm data is retained. Charts remain aligned through the week of October 5 for consistent comparisons.",
    refreshIssue: "npm statistics issue report",
    summaryLabel: "Data coverage",
    packages: "Packages",
    ecosystems: "Ecosystems",
    granularity: "Granularity",
    week: "Week",
    completeThrough: "Complete through",
    rangeTitle: "Time range",
    rangeLabel: "Select chart time range",
    range: { "1y": "1 year", "3y": "3 years", all: "All" },
    rangeDescription: { "1y": "Last 1 year", "3y": "Last 3 years", all: "All history" },
    loading: "Loading weekly data…",
    partialFailure: "Some data could not be loaded: ",
    noData: "No data is available for this range",
    latest: "Latest week",
    yearOverYear: "Year over year",
    function: "Function and use cases: ",
    downloads: "downloads",
    vendorDescriptions: {
      agora: "Web, RTM, React, React Native, and Python server packages",
      livekit: "Clients, components, React Native, Agents, and Python APIs",
      twilio: "JavaScript Voice SDK and general-purpose server SDK",
      tencent: "Web and Electron real-time media SDK",
    },
    tencent: "Tencent RTC",
    methodology: "Methodology and sources",
    methodOne: "npm data comes from the official Downloads API; PyPI data comes from the public ClickPy ClickHouse dataset. CSV files retain the latest partial week, while this page uses complete weeks only.",
    methodTwo: "npm downloads include CI, mirrors, bots, caches, and dependency installs, and packages may overlap through dependencies. The charts are best used to assess the direction and persistence of individual packages, not summed as customer counts.",
    backToTop: "Back to top",
  },
} as const;

const vendors: Array<{ key: VendorKey; index: string; name: string }> = [
  { key: "agora", index: "01", name: "Agora" },
  { key: "livekit", index: "02", name: "LiveKit" },
  { key: "twilio", index: "03", name: "Twilio" },
  { key: "tencent", index: "04", name: "Tencent RTC" },
];

function visibleRows(rows: DataRow[], range: RangeKey) {
  if (range === "all" || rows.length === 0) return rows;
  const end = Date.parse(`${rows.at(-1)?.week_start}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - (range === "1y" ? 1 : 3));
  return rows.filter((row) => Date.parse(`${row.week_start}T00:00:00Z`) >= start.getTime());
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((step) => step * magnitude).find((step) => step >= value) ?? value;
}

function DownloadChart({ rows, dataKey, label, language, empty, downloads }: {
  rows: DataRow[];
  dataKey: string;
  label: string;
  language: Language;
  empty: string;
  downloads: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const series = rows.filter((row) => typeof row[dataKey] === "number" && Number.isFinite(row[dataKey])) as Array<DataRow & Record<string, number>>;

  if (!series.length) return <p className="chart-empty">{empty}</p>;

  const width = 720;
  const height = 220;
  const left = 54;
  const right = 12;
  const top = 12;
  const bottom = 32;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = series.map((row) => row[dataKey]);
  const yMax = niceMax(Math.max(...values));
  const x = (index: number) => series.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (series.length - 1);
  const y = (value: number) => top + plotHeight - value * plotHeight / yMax;
  const points = series.map((row, index) => `${x(index)},${y(row[dataKey])}`).join(" ");
  const labelIndexes = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const exact = new Intl.NumberFormat("en-US");
  const dateLabel = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "short", timeZone: "UTC" });
  const hovered = hoverIndex === null ? null : series[hoverIndex];

  function handlePointerMove(event: PointerEvent<SVGRectElement>) {
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds) return;
    const relative = Math.max(0, Math.min(plotWidth, (event.clientX - bounds.left) * width / bounds.width - left));
    setHoverIndex(series.length === 1 ? 0 : Math.round(relative / plotWidth * (series.length - 1)));
  }

  return (
    <div className="chart-frame">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} ${language === "zh" ? "周度下载趋势" : "weekly download trend"}`}>
        {Array.from({ length: 5 }, (_, index) => {
          const value = yMax * index / 4;
          const yPosition = y(value);
          return (
            <g key={index}>
              <line x1={left} x2={width - right} y1={yPosition} y2={yPosition} className="chart-grid" />
              <text x={left - 9} y={yPosition + 4} textAnchor="end" className="axis-label">{compact.format(value)}</text>
            </g>
          );
        })}
        {labelIndexes.map((index, labelIndex) => (
          <text
            className={labelIndex === 1 ? "axis-label axis-label-mid" : "axis-label"}
            key={index}
            textAnchor={labelIndex === 0 ? "start" : labelIndex === 2 ? "end" : "middle"}
            x={x(index)}
            y={height - 8}
          >
            {dateLabel.format(new Date(`${series[index].week_start}T00:00:00Z`))}
          </text>
        ))}
        <line x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} className="chart-axis" />
        <polyline points={points} className="chart-line" />
        <circle cx={x(series.length - 1)} cy={y(values.at(-1) ?? 0)} r="3.5" className="chart-endpoint" />
        {hovered && hoverIndex !== null ? (
          <>
            <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={top} y2={top + plotHeight} className="chart-guide is-visible" />
            <circle cx={x(hoverIndex)} cy={y(hovered[dataKey])} r="4" className="chart-hover-point is-visible" />
          </>
        ) : null}
        <rect x={left} y={top} width={plotWidth} height={plotHeight} className="chart-hit" onPointerMove={handlePointerMove} onPointerLeave={() => setHoverIndex(null)} />
      </svg>
      {hovered && hoverIndex !== null ? (
        <div
          className="chart-tooltip is-visible"
          style={{ left: `${x(hoverIndex) / width * 100}%`, top: `${y(hovered[dataKey]) / height * 100}%` }}
        >
          <strong>{hovered.week_start}</strong>
          <span>{exact.format(hovered[dataKey])} {downloads}</span>
        </div>
      ) : null}
    </div>
  );
}

function PackageChart({ definition, dataset, range, language }: {
  definition: PackageDefinition;
  dataset?: LoadedDataset;
  range: RangeKey;
  language: Language;
}) {
  const text = copy[language];
  const completeRows = dataset?.rows.filter((row) => !dataset.sharedCompleteWeek || row.week_start <= dataset.sharedCompleteWeek) ?? [];
  const rows = visibleRows(completeRows, range);
  const values = completeRows.filter((row) => typeof row[definition.key] === "number");
  const latest = values.at(-1)?.[definition.key];
  const previous = values.at(-53)?.[definition.key];
  const latestNumber = typeof latest === "number" ? latest : null;
  const previousNumber = typeof previous === "number" ? previous : null;
  const change = latestNumber !== null && previousNumber !== null && previousNumber !== 0
    ? (latestNumber / previousNumber - 1) * 100
    : null;
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  return (
    <article className="package-chart">
      <div className="package-head">
        <div className="package-name">
          <h3>{definition.label}</h3>
          <p>{dataset?.registry ?? ""}</p>
        </div>
        <div className="metric">
          <span>{text.latest}</span>
          <strong>{latestNumber === null ? "—" : compact.format(latestNumber)}</strong>
        </div>
        <div className="metric">
          <span>{text.yearOverYear}</span>
          <strong className={change === null ? "is-muted" : ""}>{change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}</strong>
        </div>
      </div>
      <DownloadChart rows={rows} dataKey={definition.key} label={definition.label} language={language} empty={text.noData} downloads={text.downloads} />
      <p className="package-description"><strong>{text.function}</strong>{definition.description[language]}</p>
    </article>
  );
}

export function DownloadDashboard() {
  const { language } = useSitePreferences();
  const [range, setRange] = useState<RangeKey>("3y");
  const [manifest, setManifest] = useState<DashboardManifest | null>(null);
  const [loaded, setLoaded] = useState<Partial<Record<DatasetKey, LoadedDataset>>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const text = copy[language];

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const manifestResponse = await fetch(manifestPath);
      if (!manifestResponse.ok) throw new Error(`manifest: ${manifestResponse.status}`);
      const dashboardManifest = parseDashboardManifest(await manifestResponse.json());
      const results = await Promise.allSettled(
        (Object.entries(dashboardManifest.datasets) as Array<[DatasetKey, DashboardManifest["datasets"][string]]>).map(async ([key, definition]) => {
          const [csvResponse, metadataResponse] = await Promise.all([
            fetch(`${dashboardManifest.dataRoot}/${definition.csv}`),
            fetch(`${dashboardManifest.dataRoot}/${definition.metadata}`),
          ]);
          if (!csvResponse.ok) throw new Error(`${key}: CSV ${csvResponse.status}`);
          if (!metadataResponse.ok) throw new Error(`${key}: metadata ${metadataResponse.status}`);
          const metadata: unknown = await metadataResponse.json();
          const parsed = parseDownloadDataset(await csvResponse.text(), metadata, {
            expectedCsvFilename: definition.csv.split("/").at(-1) ?? "",
          });
          return [key, { rows: parsed.rows, registry: definition.registry, completeWeek: parsed.completeWeek }] as const;
        }),
      );

      if (cancelled) return;
      const next: Partial<Record<DatasetKey, LoadedDataset>> = {};
      const nextErrors: string[] = [];
      results.forEach((result) => {
        if (result.status === "fulfilled") next[result.value[0]] = result.value[1];
        else nextErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      });
      const loadedDatasets = Object.values(next).filter((dataset): dataset is LoadedDataset => Boolean(dataset));
      const completeWeeks = loadedDatasets.map((dataset) => dataset.completeWeek).filter((value): value is string => Boolean(value)).sort();
      const sharedCompleteWeek = completeWeeks[0];
      loadedDatasets.forEach((dataset) => { dataset.sharedCompleteWeek = sharedCompleteWeek; });
      setManifest(dashboardManifest);
      setLoaded(next);
      setErrors(nextErrors);
      setLoading(false);
    }

    load().catch((error: unknown) => {
      if (cancelled) return;
      setErrors([error instanceof Error ? error.message : String(error)]);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const visiblePackages = manifest ? packageDefinitions(manifest) : [];
  const sharedCompleteWeek = useMemo(
    () => Object.values(loaded).find((dataset): dataset is LoadedDataset => Boolean(dataset))?.sharedCompleteWeek,
    [loaded],
  );

  return (
    <>
      <SiteHeader />
      <main className="site-main dashboard-page" id="top">
        <header className="dashboard-hero rise delay-1">
          <h1>{text.title}</h1>
          <div className="dashboard-intro">
            <p>{text.intro}</p>
            <p>{text.caveat}</p>
          </div>
        </header>

        <section className="summary-strip rise delay-2" aria-label={text.summaryLabel}>
          <div className="summary-item"><span>{text.packages}</span><strong>{visiblePackages.length}</strong></div>
          <div className="summary-item"><span>{text.ecosystems}</span><strong>4</strong></div>
          <div className="summary-item"><span>{text.granularity}</span><strong>{text.week}</strong></div>
          <div className="summary-item"><span>{text.completeThrough}</span><strong>{sharedCompleteWeek ?? "—"}</strong></div>
        </section>

        <p className="load-status">
          {text.refreshNotice} <a href="https://github.com/orgs/community/discussions/211210">{text.refreshIssue}</a>
        </p>

        <section className="view-options rise delay-2" aria-label={text.rangeLabel}>
          <div><h2>{text.rangeTitle}</h2><p>{text.rangeDescription[range]}</p></div>
          <div className="range-control" role="group" aria-label={text.rangeLabel}>
            {(["1y", "3y", "all"] as const).map((rangeKey) => (
              <button key={rangeKey} type="button" aria-pressed={range === rangeKey} onClick={() => setRange(rangeKey)}>
                {text.range[rangeKey]}
              </button>
            ))}
          </div>
        </section>

        <p className="load-status" role="status" aria-live="polite">
          {loading ? text.loading : errors.length ? `${text.partialFailure}${errors.join("; ")}` : ""}
        </p>

        <div id="dashboard" aria-busy={loading}>
          {vendors.map((vendor, vendorIndex) => (
            <section className={`vendor-section vendor-${vendor.key} rise`} style={{ animationDelay: `${180 + vendorIndex * 40}ms` }} aria-labelledby={`${vendor.key}-heading`} key={vendor.key}>
              <header className="dashboard-section-header">
                <div><p className="section-index">{vendor.index}</p><h2 id={`${vendor.key}-heading`}>{vendor.key === "tencent" && language === "zh" ? text.tencent : vendor.name}</h2></div>
                <p>{text.vendorDescriptions[vendor.key]}</p>
              </header>
              <div className="chart-list">
                {visiblePackages.filter((definition) => definition.vendor === vendor.key).map((definition) => (
                  <PackageChart key={definition.key} definition={definition} dataset={loaded[definition.dataset]} range={range} language={language} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="dashboard-methodology rise">
          <h2>{text.methodology}</h2>
          <p>{text.methodOne}</p>
          <p>{text.methodTwo}</p>
        </aside>

        <footer className="dashboard-footer rise">
          <a href="#top">{text.backToTop}</a>
          <a href="https://www.zhemin.ltd">@Zhemin</a>
        </footer>
      </main>
    </>
  );
}
