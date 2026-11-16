"use client";

import styles from "./agora-key-metrics.module.css";

import { useEffect } from "react";

import metricsData from "@/data/agora_quarterly_key_metrics.json";
import { SiteHeader } from "@/components/site-header";
import { useSitePreferences } from "@/components/site-preferences";

type MetricValue = string | number | null;

export function AgoraKeyMetricsPageContent() {
  const { language } = useSitePreferences();
  const isEnglish = language === "en";
  const title = isEnglish ? "Agora Key Metrics" : "声网核心数据";
  const headers = isEnglish ? metricsData.headers.en : metricsData.headers.zh;
  const release = metricsData.latestRelease;
  const numberLocale = isEnglish ? "en-US" : "zh-CN";

  useEffect(() => {
    document.title = `${title} | Agora Equity Research`;
  }, [title]);

  return (
    <>
      <SiteHeader />
      <main className={`site-main metrics-page ${styles.metricsScope}`} id="top">
        <header className="metrics-header rise delay-1">
          <h1>{title}</h1>
          <p className="metrics-release-meta">
            {isEnglish ? "Updated through " : "数据更新至 "}{release.quarter}
            {" · "}
            <a href={release.url} target="_blank" rel="noopener noreferrer">
              {isEnglish ? "Official results (unaudited)" : "官方财报（未经审计）"}
            </a>
            {" · "}<time dateTime={release.publishedAt}>{release.publishedAt}</time>
          </p>
          <p className="metrics-business-summary">
            {isEnglish ? "Active customers as of " : "截至 "}
            <time dateTime={release.periodEnd}>{release.periodEnd}</time>
            {isEnglish ? ": " : "，活跃客户 "}
            <strong>{release.activeCustomers.toLocaleString(numberLocale)}</strong>
            {isEnglish ? " (prior year: " : " 个（上年同期 "}
            {release.activeCustomersPriorYear.toLocaleString(numberLocale)}
            {isEnglish ? ")." : " 个）。"}
          </p>
        </header>

        <section
          aria-label={title}
          className="metrics-table-frame rise delay-2"
          role="region"
          tabIndex={0}
        >
          <table className="metrics-table">
            <thead>
              <tr>
                {headers.map((header) => <th key={header} scope="col">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {metricsData.rows.map((row, rowIndex) => (
                <tr
                  key={String(row[0] ?? rowIndex)}
                  className={row[0] === release.quarter ? "metrics-table__latest" : undefined}
                >
                  {row.map((value: MetricValue, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} className={cellIndex === 0 ? "metrics-table__quarter" : undefined}>
                      {value === null ? "" : value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="metrics-notes" aria-label={isEnglish ? "Data definitions" : "数据口径说明"}>
          <p>
            {isEnglish
              ? "Amounts are in US$ millions; percentages are shown as reported. Q3 2026 statement amounts are rounded to two decimals, and the cash balance follows the release's one-decimal precision. Blank cells indicate unavailable disclosures. Agora and Shengwang revenue and retention rates were not separately disclosed for Q3 2026."
              : "金额单位为百万美元，百分比按公司披露。2026 Q3 报表金额四舍五入至两位小数，现金合计沿用公告的一位小数精度。空白表示未披露；本季未分别披露 Agora 与声网的收入及留存率。"}
          </p>
          <p>
            {isEnglish
              ? "Active customers generated more than US$100 in revenue during the preceding 12 months, excluding Easemob customers."
              : "活跃客户指过去 12 个月贡献收入超过 100 美元的组织或个人开发者，不含环信客户。"}
          </p>
          <p>
            {isEnglish
              ? "For Q3 2026, cash comprises cash and cash equivalents, short- and long-term bank deposits, and bank-issued financial products; it excludes restricted cash and separately reported investments."
              : "2026 Q3 现金合计包括现金及现金等价物、短期与长期银行存款、银行理财产品，不含受限现金及单列的投资。"}
          </p>
          <p>
            {isEnglish
              ? "Capex is the cash outflow for property and equipment, shown as a negative value. Free cash flow is calculated as operating cash flow plus this signed capex; both exclude the separately reported headquarters construction spending (US$3.037 million in Q3 2026). Q3 free cash flow is (2,153 − 101) / 1,000 = US$2.052 million before rounding."
              : "资本开支为购置固定资产的现金流出，以负值列示；自由现金流按经营现金流加该负值资本开支计算。此口径不含单列的总部在建工程支出（2026 Q3 为 3.037 百万美元）。本季自由现金流按未舍入金额计算：(2,153 − 101) / 1,000 = 2.052 百万美元。"}
          </p>
        </aside>
      </main>
    </>
  );
}
