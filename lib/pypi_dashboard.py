"""Fetch PyPI metadata and weekly downloads for the single-page dashboard."""

from __future__ import annotations

import csv
import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .dashboard_outputs import OutputSafetyError, load_existing_rows, validate_rows, write_pair_atomic

CLICKHOUSE_ENDPOINT = "https://sql-clickhouse.clickhouse.com/"
PYPI_JSON_URL = "https://pypi.org/pypi/{package}/json"
INCREMENTAL_OVERLAP_DAYS = 14


@dataclass
class PackageMeta:
    exists: bool
    summary: str | None = None
    latest_version: str | None = None
    requires_python: str | None = None
    first_upload: date | None = None
    package_url: str | None = None
    source_url: str | None = None
    error: str | None = None


@dataclass
class PyPIConfig:
    vendor: str
    packages: list[str]
    csv_path: Path
    meta_path: Path
    user_agent: str = "codex-pypi-weekly-dashboard/1.0"


def fetch_url(
    url: str,
    *,
    data: bytes | None = None,
    accept: str = "application/json",
    user_agent: str,
    retries: int = 5,
) -> str:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                url,
                data=data,
                headers={"Accept": accept, "Content-Type": "text/plain; charset=utf-8", "User-Agent": user_agent},
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            if exc.code in {429, 500, 502, 503, 504} and attempt < retries - 1:
                last_error = exc
                time.sleep(2.5 * (attempt + 1))
                continue
            raise
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def clickhouse_csv(sql: str, *, user_agent: str) -> list[dict[str, str]]:
    url = f"{CLICKHOUSE_ENDPOINT}?{urllib.parse.urlencode({'user': 'demo'})}"
    text = fetch_url(url, data=sql.encode(), accept="text/csv", user_agent=user_agent)
    return list(csv.DictReader(io.StringIO(text)))


def load_meta(package: str, *, user_agent: str) -> PackageMeta:
    url = PYPI_JSON_URL.format(package=urllib.parse.quote(package, safe=""))
    try:
        payload = json.loads(fetch_url(url, user_agent=user_agent))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return PackageMeta(exists=False, error=f"HTTP {exc.code}: {exc.reason}")
        raise
    info = payload.get("info", {})
    uploads = []
    for files in payload.get("releases", {}).values():
        for file_info in files:
            raw = file_info.get("upload_time_iso_8601") or file_info.get("upload_time")
            if raw:
                try:
                    uploads.append(datetime.fromisoformat(raw.replace("Z", "+00:00")).date())
                except ValueError:
                    pass
    project_urls = info.get("project_urls") or {}
    return PackageMeta(
        exists=True,
        summary=info.get("summary"),
        latest_version=info.get("version"),
        requires_python=info.get("requires_python"),
        first_upload=min(uploads) if uploads else None,
        package_url=info.get("package_url") or info.get("project_url"),
        source_url=(
            project_urls.get("Source")
            or project_urls.get("Repository")
            or project_urls.get("Homepage")
            or info.get("home_page")
        ),
    )


def latest_download_day(*, user_agent: str) -> date:
    sql = "SELECT toString(max(date)) AS d FROM pypi.pypi_downloads_per_day FORMAT CSVWithNames"
    rows = clickhouse_csv(sql, user_agent=user_agent)
    if not rows or not rows[0].get("d"):
        raise RuntimeError("ClickHouse returned no latest PyPI download date")
    return date.fromisoformat(rows[0]["d"])


def fetch_weekly(
    packages: list[str],
    *,
    user_agent: str,
    start: date | None = None,
    end: date | None = None,
) -> list[dict[str, str]]:
    values = ", ".join("'" + package.replace("'", "\\'") + "'" for package in packages)
    conditions = [f"project IN ({values})"]
    if start is not None:
        conditions.append(f"date >= '{start.isoformat()}'")
    if end is not None:
        conditions.append(f"date <= '{end.isoformat()}'")
    sql = f"""
SELECT toString(toMonday(date)) AS week_start, project, sum(count) AS downloads
FROM pypi.pypi_downloads_per_day
WHERE {' AND '.join(conditions)}
GROUP BY week_start, project
ORDER BY week_start, project
FORMAT CSVWithNames""".strip()
    return clickhouse_csv(sql, user_agent=user_agent)


def coverage_week(first_upload: date | None, observed_week: date | None) -> date | None:
    first_week = first_upload - timedelta(days=first_upload.weekday()) if first_upload else None
    if first_week and observed_week:
        return max(first_week, observed_week)
    return first_week or observed_week


def build_rows(
    raw_rows: list[dict[str, str]],
    packages: list[str],
    first_uploads: dict[str, date | None] | None = None,
) -> list[dict[str, int | str]]:
    weekly = {
        (date.fromisoformat(row["week_start"]), row["project"]): int(row["downloads"])
        for row in raw_rows
    }
    if not weekly:
        return []
    weeks = [week for week, _ in weekly]
    rows = []
    current = min(weeks)
    observed_starts = {
        package: min((week for week, project in weekly if project == package), default=None)
        for package in packages
    }
    while current <= max(weeks):
        values: dict[str, int | str] = {}
        for package in packages:
            first_upload = first_uploads.get(package) if first_uploads else None
            package_coverage = coverage_week(first_upload, observed_starts[package])
            values[package] = "" if package_coverage is None or current < package_coverage else weekly.get((current, package), 0)
        rows.append({
            "week_start": current.isoformat(),
            **values,
        })
        current += timedelta(days=7)
    return rows


def merge_incremental_rows(
    existing_rows: list[dict[str, str]],
    raw_rows: list[dict[str, str]],
    packages: list[str],
    latest_day: date,
    first_uploads: dict[str, date | None],
) -> list[dict[str, int | str]]:
    """Merge a recent ClickHouse window into the previously published rows."""

    weekly = {
        (date.fromisoformat(row["week_start"]), row["project"]): int(row["downloads"])
        for row in raw_rows
    }
    if not weekly:
        raise OutputSafetyError("ClickHouse returned no rows for an incremental refresh")

    raw_observed_starts = {
        package: min((week for week, project in weekly if project == package), default=None)
        for package in packages
    }
    existing_observed_starts = {
        package: min(
            (
                date.fromisoformat(row["week_start"])
                for row in existing_rows
                if row.get(package, "") != ""
            ),
            default=None,
        )
        for package in packages
    }
    observed_starts = {
        package: existing_observed_starts[package] or raw_observed_starts[package]
        for package in packages
    }
    refresh_week = min(week for week, _ in weekly)

    rows: list[dict[str, int | str]] = [dict(row) for row in existing_rows]
    for row in rows:
        current = date.fromisoformat(str(row["week_start"]))
        for package in packages:
            package_coverage = coverage_week(first_uploads.get(package), observed_starts[package])
            if current >= refresh_week:
                row[package] = (
                    ""
                    if package_coverage is None or current < package_coverage
                    else weekly.get((current, package), 0)
                )

    current = date.fromisoformat(str(rows[-1]["week_start"])) + timedelta(days=7)
    last_week = latest_day - timedelta(days=latest_day.weekday())
    while current <= last_week:
        values: dict[str, int | str] = {}
        for package in packages:
            package_coverage = coverage_week(first_uploads.get(package), observed_starts[package])
            values[package] = (
                ""
                if package_coverage is None or current < package_coverage
                else weekly.get((current, package), 0)
            )
        rows.append({"week_start": current.isoformat(), **values})
        current += timedelta(days=7)
    return rows


def incremental_query_start(configs: list[PyPIConfig], *, rebuild: bool = False) -> date | None:
    """Return one shared overlap start for a group of PyPI datasets."""

    if rebuild:
        return None
    starts: list[date] = []
    for config in configs:
        existing_rows = load_existing_rows(config.csv_path, ["week_start", *config.packages])
        if not existing_rows:
            return None
        last_week = date.fromisoformat(existing_rows[-1]["week_start"])
        starts.append(last_week - timedelta(days=INCREMENTAL_OVERLAP_DAYS))
    return min(starts)


def complete_week(rows: list[dict[str, int | str]], latest_day: date) -> str | None:
    for row in reversed(rows):
        monday = date.fromisoformat(str(row["week_start"]))
        if monday + timedelta(days=6) <= latest_day:
            return monday.isoformat()
    return None


def write_outputs(
    rows: list[dict[str, int | str]], metas: dict[str, PackageMeta], latest_day: date, config: PyPIConfig
) -> None:
    columns = ["week_start", *config.packages]
    validate_rows(rows, columns)
    csv_buffer = io.StringIO(newline="")
    writer = csv.DictWriter(csv_buffer, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)

    latest_complete = complete_week(rows, latest_day)
    metadata = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "vendor": config.vendor,
        "source": {
            "download_table": "pypi.pypi_downloads_per_day",
            "download_provider": "ClickPy public ClickHouse endpoint",
            "metadata_provider": "PyPI JSON API",
            "source_last_date": latest_day.isoformat(),
            "weekly_grain": "Monday-start weeks",
            "latest_complete_week_start": latest_complete,
        },
        "dataset": {
            "csv": config.csv_path.name,
            "rows": len(rows),
            "first_week_start": str(rows[0]["week_start"]) if rows else None,
            "last_week_start": str(rows[-1]["week_start"]) if rows else None,
            "latest_complete_week_start": latest_complete,
            "columns": columns,
        },
        "packages": {
            package: {
                "exists": meta.exists,
                "summary": meta.summary,
                "latest_version": meta.latest_version,
                "requires_python": meta.requires_python,
                "first_upload": meta.first_upload.isoformat() if meta.first_upload else None,
                "package_url": meta.package_url,
                "source_url": meta.source_url,
                "error": meta.error,
            }
            for package, meta in metas.items()
        },
    }
    write_pair_atomic(
        config.csv_path,
        csv_buffer.getvalue(),
        config.meta_path,
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        columns=columns,
        latest_week=date.fromisoformat(rows[-1]["week_start"]),
        row_count=len(rows),
    )


def run_pypi(
    config: PyPIConfig,
    *,
    latest_day: date | None = None,
    raw_rows: list[dict[str, str]] | None = None,
    rebuild: bool = False,
) -> dict:
    """Refresh one PyPI dataset, using a shared recent query when supplied."""
    metas = {package: load_meta(package, user_agent=config.user_agent) for package in config.packages}
    latest_day = latest_day or latest_download_day(user_agent=config.user_agent)
    columns = ["week_start", *config.packages]
    existing_rows = [] if rebuild else load_existing_rows(config.csv_path, columns)
    if raw_rows is None:
        query_start = None
        if existing_rows:
            last_week = date.fromisoformat(existing_rows[-1]["week_start"])
            query_start = last_week - timedelta(days=INCREMENTAL_OVERLAP_DAYS)
        raw_rows = fetch_weekly(
            config.packages,
            user_agent=config.user_agent,
            start=query_start,
            end=latest_day,
        )
    first_uploads = {package: meta.first_upload for package, meta in metas.items()}
    rows = (
        merge_incremental_rows(existing_rows, raw_rows, config.packages, latest_day, first_uploads)
        if existing_rows
        else build_rows(raw_rows, config.packages, first_uploads)
    )
    write_outputs(rows, metas, latest_day, config)
    return {
        "csv": str(config.csv_path),
        "metadata": str(config.meta_path),
        "rows": len(rows),
        "source_last_date": latest_day.isoformat(),
    }
