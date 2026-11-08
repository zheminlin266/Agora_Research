import assert from "node:assert/strict";

import { DownloadDataError, parseDashboardManifest, parseDownloadDataset, weeklyComparison } from "../lib/download-data.ts";

const comparisonRows = Array.from({ length: 53 }, (_, index) => ({
  week_start: new Date(Date.UTC(2025, 9, 27 + index * 7)).toISOString().slice(0, 10),
  demo: index === 50 || index === 51 ? null : index === 0 ? 100 : 200,
}));
assert.deepEqual(weeklyComparison(comparisonRows, "demo", "2026-10-26"), { latestNumber: 200, change: 100 });
assert.deepEqual(weeklyComparison(comparisonRows, "demo", "2026-10-19"), { latestNumber: null, change: null });

const csv = [
  "week_start,alpha,beta",
  "2024-01-01,5,",
  "2024-01-08,0,2",
  "",
].join("\n");

const metadata = {
  vendor: "demo",
  source: { latest_complete_week_start: "2024-01-01" },
  dataset: {
    csv: "demo.csv",
    rows: 2,
    columns: ["week_start", "alpha", "beta"],
    latest_complete_week_start: "2024-01-01",
  },
};

const parsed = parseDownloadDataset(csv, metadata, { expectedCsvFilename: "demo.csv" });
assert.deepEqual(parsed.rows, [
  { week_start: "2024-01-01", alpha: 5, beta: null },
  { week_start: "2024-01-08", alpha: 0, beta: 2 },
]);
assert.equal(parsed.completeWeek, "2024-01-01");

assert.throws(
  () => parseDownloadDataset(csv.replace(",5,", ",NaN,"), metadata, { expectedCsvFilename: "demo.csv" }),
  DownloadDataError,
);
assert.throws(
  () => parseDownloadDataset(csv, { ...metadata, dataset: { ...metadata.dataset, rows: 1 } }, { expectedCsvFilename: "demo.csv" }),
  /rows does not match/,
);
assert.throws(
  () => parseDownloadDataset(csv, { ...metadata, source: {} }, { expectedCsvFilename: "demo.csv" }),
  /latest_complete_week_start/,
);
assert.throws(
  () => parseDownloadDataset(csv.replace("2024-01-08", "2024-01-09"), metadata, { expectedCsvFilename: "demo.csv" }),
  /Monday/,
);

const manifest = parseDashboardManifest({
  version: 1,
  data_root: "/data/dev-npm-downloads",
  datasets: {
    demo: {
      vendor: "demo",
      registry: "npm",
      csv: "Data/demo.csv",
      metadata: "json/demo.json",
      packages: ["alpha", "beta"],
    },
  },
  packages: [
    { vendor: "demo", dataset: "demo", key: "alpha" },
    { vendor: "demo", dataset: "demo", key: "beta" },
  ],
});
assert.equal(manifest.datasets.demo.csv, "Data/demo.csv");
assert.equal(manifest.packages.length, 2);
assert.throws(
  () => parseDashboardManifest({
    ...manifest,
    data_root: manifest.dataRoot,
    packages: [{ vendor: "other", dataset: "demo", key: "alpha" }],
  }),
  /vendor does not match/,
);

console.log("download-data parser checks passed");
