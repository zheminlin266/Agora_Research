export type DownloadCell = number | null;

export type DownloadRow = {
  week_start: string;
  [column: string]: string | DownloadCell;
};

export function weeklyComparison(rows: DownloadRow[], key: string, completeWeek: string) {
  const previousWeek = new Date(`${completeWeek}T00:00:00Z`);
  previousWeek.setUTCDate(previousWeek.getUTCDate() - 52 * 7);
  const previousDate = previousWeek.toISOString().slice(0, 10);
  const latest = rows.find((row) => row.week_start === completeWeek)?.[key];
  const previous = rows.find((row) => row.week_start === previousDate)?.[key];
  const latestNumber = typeof latest === "number" ? latest : null;
  const change = latestNumber !== null && typeof previous === "number" && previous !== 0
    ? (latestNumber / previous - 1) * 100
    : null;
  return { latestNumber, change };
}

export type ParsedDownloadCsv = {
  rows: DownloadRow[];
  columns: string[];
};

export type LoadedDownloadDataset = ParsedDownloadCsv & {
  completeWeek: string;
  vendor: string;
};

export class DownloadDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadDataError";
  }
}

const INTEGER_RE = /^(?:0|[1-9][0-9]*)$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DownloadDataError(`${field} must be an object`);
  }
  return value as UnknownRecord;
}

function requiredString(record: UnknownRecord, key: string, field: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new DownloadDataError(`${field} must be a non-empty string`);
  }
  return value;
}

function requiredInteger(record: UnknownRecord, key: string, field: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new DownloadDataError(`${field} must be a positive integer`);
  }
  return value;
}

function parseMonday(value: string, field: string): number {
  if (!ISO_DATE_RE.test(value)) {
    throw new DownloadDataError(`${field} must be an ISO date`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new DownloadDataError(`${field} is not a valid date`);
  }
  if (parsed.getUTCDay() !== 1) {
    throw new DownloadDataError(`${field} must be a Monday`);
  }
  return parsed.getTime();
}

function parseCsvRecords(text: string): string[][] {
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;

  const pushRecord = () => {
    record.push(cell);
    cell = "";
    if (record.some((value) => value !== "")) records.push(record);
    record = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      if (cell.length > 0) throw new DownloadDataError("CSV has an invalid quoted field");
      quoted = true;
    } else if (character === ",") {
      record.push(cell);
      cell = "";
    } else if (character === "\n") {
      pushRecord();
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (quoted) throw new DownloadDataError("CSV has an unterminated quoted field");
  if (record.length > 0 || cell.length > 0) pushRecord();
  return records;
}

function sameStringArray(left: unknown, right: string[]): boolean {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export function parseDownloadCsv(text: string): ParsedDownloadCsv {
  const records = parseCsvRecords(text);
  if (records.length < 2) throw new DownloadDataError("CSV must contain a header and at least one row");

  const columns = records[0];
  if (columns[0] !== "week_start" || columns.some((column) => column.length === 0)) {
    throw new DownloadDataError("CSV columns must start with week_start and cannot be empty");
  }
  if (new Set(columns).size !== columns.length) {
    throw new DownloadDataError("CSV columns must be unique");
  }

  let previousWeek: number | null = null;
  const rows = records.slice(1).map((cells, rowIndex) => {
    if (cells.length !== columns.length) {
      throw new DownloadDataError(`CSV row ${rowIndex + 2} does not match the header`);
    }
    const week = cells[0];
    const weekTime = parseMonday(week, `CSV row ${rowIndex + 2}.week_start`);
    if (previousWeek !== null && weekTime !== previousWeek + 7 * 24 * 60 * 60 * 1000) {
      throw new DownloadDataError(`CSV weeks are not continuous at row ${rowIndex + 2}`);
    }
    previousWeek = weekTime;

    const row: DownloadRow = { week_start: week };
    columns.slice(1).forEach((column, columnIndex) => {
      const raw = cells[columnIndex + 1];
      if (raw === "") {
        row[column] = null;
      } else if (!INTEGER_RE.test(raw)) {
        throw new DownloadDataError(`CSV row ${rowIndex + 2}.${column} must be a non-negative integer or blank`);
      } else {
        const value = Number(raw);
        if (!Number.isSafeInteger(value)) {
          throw new DownloadDataError(`CSV row ${rowIndex + 2}.${column} is too large`);
        }
        row[column] = value;
      }
    });
    return row;
  });

  return { rows, columns };
}

export function parseDownloadDataset(
  csvText: string,
  metadata: unknown,
  options: { expectedCsvFilename: string },
): LoadedDownloadDataset {
  const parsedCsv = parseDownloadCsv(csvText);
  const root = asRecord(metadata, "metadata");
  const source = asRecord(root.source, "metadata.source");
  const dataset = asRecord(root.dataset, "metadata.dataset");
  const vendor = requiredString(root, "vendor", "metadata.vendor");
  const csvFilename = requiredString(dataset, "csv", "metadata.dataset.csv");
  if (csvFilename !== options.expectedCsvFilename) {
    throw new DownloadDataError("metadata.dataset.csv does not match the requested dataset");
  }
  if (!sameStringArray(dataset.columns, parsedCsv.columns)) {
    throw new DownloadDataError("metadata.dataset.columns does not match the CSV header");
  }
  if (requiredInteger(dataset, "rows", "metadata.dataset.rows") !== parsedCsv.rows.length) {
    throw new DownloadDataError("metadata.dataset.rows does not match the CSV");
  }

  const sourceCompleteWeek = requiredString(
    source,
    "latest_complete_week_start",
    "metadata.source.latest_complete_week_start",
  );
  const datasetCompleteWeek = requiredString(
    dataset,
    "latest_complete_week_start",
    "metadata.dataset.latest_complete_week_start",
  );
  const sourceCompleteTime = parseMonday(sourceCompleteWeek, "metadata.source.latest_complete_week_start");
  if (sourceCompleteWeek !== datasetCompleteWeek) {
    throw new DownloadDataError("metadata complete-week fields disagree");
  }
  const firstWeek = parseMonday(parsedCsv.rows[0].week_start, "CSV first week");
  const lastWeek = parseMonday(parsedCsv.rows.at(-1)?.week_start ?? "", "CSV last week");
  if (sourceCompleteTime < firstWeek || sourceCompleteTime > lastWeek) {
    throw new DownloadDataError("metadata complete week is outside the CSV range");
  }

  return { ...parsedCsv, completeWeek: sourceCompleteWeek, vendor };
}

export type DashboardManifestDataset = {
  vendor: string;
  registry: string;
  csv: string;
  metadata: string;
  packages: string[];
};

export type DashboardManifestPackage = {
  vendor: string;
  dataset: string;
  key: string;
};

export type DashboardManifest = {
  version: 1;
  dataRoot: string;
  datasets: Record<string, DashboardManifestDataset>;
  packages: DashboardManifestPackage[];
};

export function parseDashboardManifest(value: unknown): DashboardManifest {
  const root = asRecord(value, "manifest");
  if (root.version !== 1) throw new DownloadDataError("manifest.version must be 1");
  const dataRoot = requiredString(root, "data_root", "manifest.data_root");
  const datasetRecord = asRecord(root.datasets, "manifest.datasets");
  const datasets: Record<string, DashboardManifestDataset> = {};

  Object.entries(datasetRecord).forEach(([key, rawDataset]) => {
    const dataset = asRecord(rawDataset, `manifest.datasets.${key}`);
    const rawPackages = dataset.packages;
    if (!Array.isArray(rawPackages) || !rawPackages.every((item) => typeof item === "string" && item.length > 0)) {
      throw new DownloadDataError(`manifest.datasets.${key}.packages must be a non-empty string list`);
    }
    if (new Set(rawPackages).size !== rawPackages.length) {
      throw new DownloadDataError(`manifest.datasets.${key}.packages must be unique`);
    }
    const csv = requiredString(dataset, "csv", `manifest.datasets.${key}.csv`);
    const metadata = requiredString(dataset, "metadata", `manifest.datasets.${key}.metadata`);
    if (csv.startsWith("/") || metadata.startsWith("/") || csv.includes("..") || metadata.includes("..")) {
      throw new DownloadDataError(`manifest.datasets.${key} paths must be relative and local`);
    }
    datasets[key] = {
      vendor: requiredString(dataset, "vendor", `manifest.datasets.${key}.vendor`),
      registry: requiredString(dataset, "registry", `manifest.datasets.${key}.registry`),
      csv,
      metadata,
      packages: [...rawPackages],
    };
  });

  if (!Array.isArray(root.packages)) throw new DownloadDataError("manifest.packages must be a list");
  const packages = root.packages.map((rawPackage, index) => {
    const packageRecord = asRecord(rawPackage, `manifest.packages[${index}]`);
    const item = {
      vendor: requiredString(packageRecord, "vendor", `manifest.packages[${index}].vendor`),
      dataset: requiredString(packageRecord, "dataset", `manifest.packages[${index}].dataset`),
      key: requiredString(packageRecord, "key", `manifest.packages[${index}].key`),
    };
    const dataset = datasets[item.dataset];
    if (!dataset || !dataset.packages.includes(item.key)) {
      throw new DownloadDataError(`manifest package ${item.key} does not match its dataset`);
    }
    if (dataset.vendor !== item.vendor) {
      throw new DownloadDataError(`manifest package ${item.key} vendor does not match its dataset`);
    }
    return item;
  });
  if (new Set(packages.map((item) => item.key)).size !== packages.length) {
    throw new DownloadDataError("manifest package keys must be unique");
  }

  return { version: 1, dataRoot, datasets, packages };
}
