"""Fetch npm metadata and weekly downloads for the single-page dashboard."""

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

NPM_REGISTRY = "https://registry.npmjs.org"
NPM_DOWNLOADS = "https://api.npmjs.org/downloads"
EARLIEST_DOWNLOAD_DATE = date(2015, 1, 10)
MAX_RANGE_DAYS = 548
INCREMENTAL_OVERLAP_DAYS = 14
RETRYABLE_HTTP_STATUS = {429, 500, 502, 503, 504}


@dataclass
class PackageMeta:
    exists: bool
    created: date | None = None
    created_raw: str | None = None
    modified_raw: str | None = None
    description: str | None = None
    latest_version: str | None = None
    error: str | None = None


@dataclass
class VendorConfig:
    vendor: str
    packages: list[str]
    csv_path: Path
    meta_path: Path
    user_agent: str = "codex-npm-weekly-dashboard/1.0"


def fetch_json(url: str, *, user_agent: str, retries: int = 6) -> dict:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                url, headers={"Accept": "application/json", "User-Agent": user_agent}
            )
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in RETRYABLE_HTTP_STATUS and attempt < retries - 1:
                try:
                    wait = float(exc.headers.get("Retry-After") or min(30, 1.5 * (2**attempt)))
                except ValueError:
                    wait = min(30, 1.5 * (2**attempt))
                time.sleep(wait)
                continue
            raise
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < retries - 1:
                time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def parse_iso_date(raw: str) -> date:
    return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc).date()


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def latest_complete_week(latest_day: date) -> date:
    monday = week_start(latest_day)
    return monday if latest_day >= monday + timedelta(days=6) else monday - timedelta(days=7)


def iter_ranges(start: date, end: date):
    current = start
    while current <= end:
        chunk_end = min(current + timedelta(days=MAX_RANGE_DAYS - 1), end)
        yield current, chunk_end
        current = chunk_end + timedelta(days=1)


def load_package_meta(package: str, *, user_agent: str) -> PackageMeta:
    url = f"{NPM_REGISTRY}/{urllib.parse.quote(package, safe='')}"
    try:
        data = fetch_json(url, user_agent=user_agent)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return PackageMeta(exists=False, error=f"HTTP {exc.code}: {exc.reason}")
        raise
    created_raw = data.get("time", {}).get("created")
    return PackageMeta(
        exists=True,
        created=parse_iso_date(created_raw) if created_raw else None,
        created_raw=created_raw,
        modified_raw=data.get("time", {}).get("modified"),
        description=data.get("description"),
        latest_version=data.get("dist-tags", {}).get("latest"),
    )


def latest_download_day(*, user_agent: str) -> date:
    payload = fetch_json(f"{NPM_DOWNLOADS}/point/last-day", user_agent=user_agent)
    return min(date.fromisoformat(payload["end"]), datetime.now(timezone.utc).date() - timedelta(days=1))


def load_weekly(package: str, start: date, end: date, *, user_agent: str) -> dict[date, int]:
    weekly: dict[date, int] = {}
    encoded = urllib.parse.quote(package, safe="")
    for chunk_start, chunk_end in iter_ranges(start, end):
        period = f"{chunk_start.isoformat()}:{chunk_end.isoformat()}"
        payload = fetch_json(f"{NPM_DOWNLOADS}/range/{period}/{encoded}", user_agent=user_agent)
        time.sleep(0.25)
        for row in payload.get("downloads", []):
            monday = week_start(date.fromisoformat(row["day"]))
            weekly[monday] = weekly.get(monday, 0) + int(row.get("downloads", 0))
    return weekly


def build_rows(
    metas: dict[str, PackageMeta],
    downloads: dict[str, dict[date, int]],
    latest_day: date,
    coverage_starts: dict[str, date] | None = None,
) -> list[dict[str, str]]:
    starts = [week_start(meta.created) for meta in metas.values() if meta.created]
    if not starts:
        return []
    rows: list[dict[str, str]] = []
    current = min(starts)
    while current <= week_start(latest_day):
        row = {"week_start": current.isoformat()}
        for package, meta in metas.items():
            start = week_start(meta.created) if meta.created else None
            coverage_start = coverage_starts.get(package) if coverage_starts else None
            coverage_week = max(start, week_start(coverage_start)) if start and coverage_start else start
            row[package] = (
                ""
                if coverage_week is None or current < coverage_week
                else str(downloads[package].get(current, 0))
            )
        rows.append(row)
        current += timedelta(days=7)
    return rows


def merge_incremental_rows(
    existing_rows: list[dict[str, str]],
    metas: dict[str, PackageMeta],
    downloads: dict[str, dict[date, int]],
    latest_day: date,
    coverage_starts: dict[str, date],
    fetch_starts: dict[str, date],
) -> list[dict[str, str]]:
    """Merge an overlapping recent fetch into the previously published rows."""

    rows = [dict(row) for row in existing_rows]
    for package in metas:
        coverage_week = week_start(coverage_starts[package]) if package in coverage_starts else None
        refresh_week = week_start(fetch_starts[package]) if package in fetch_starts else None
        for row in rows:
            current = date.fromisoformat(row["week_start"])
            if refresh_week is not None and current >= refresh_week:
                row[package] = (
                    ""
                    if coverage_week is None or current < coverage_week
                    else str(downloads[package].get(current, 0))
                )

    current = date.fromisoformat(rows[-1]["week_start"]) + timedelta(days=7)
    last_week = week_start(latest_day)
    while current <= last_week:
        row = {"week_start": current.isoformat()}
        for package in metas:
            coverage_week = week_start(coverage_starts[package]) if package in coverage_starts else None
            row[package] = (
                ""
                if coverage_week is None or current < coverage_week
                else str(downloads[package].get(current, 0))
            )
        rows.append(row)
        current += timedelta(days=7)
    return rows


def write_outputs(
    rows: list[dict[str, str]], metas: dict[str, PackageMeta], latest_day: date, config: VendorConfig
) -> None:
    columns = ["week_start", *config.packages]
    validate_rows(rows, columns)

    # An incremental merge can retain its final row even when the source date
    # regresses, so the shared CSV shape checks alone cannot detect a rollback.
    if config.meta_path.exists():
        try:
            previous = json.loads(config.meta_path.read_text(encoding="utf-8"))
            raw_day = previous.get("source", {}).get("latest_download_day")
            previous_day = date.fromisoformat(raw_day) if raw_day else None
        except (OSError, ValueError, TypeError, AttributeError) as exc:
            raise OutputSafetyError(f"Cannot inspect existing npm source date: {config.meta_path}") from exc
        if previous_day is not None and latest_day < previous_day:
            raise OutputSafetyError(
                f"Refusing to replace {config.csv_path.name}: source date moved backwards "
                f"from {previous_day.isoformat()} to {latest_day.isoformat()}"
            )
    existing_rows = load_existing_rows(config.csv_path, columns)
    if existing_rows:
        previous_week = date.fromisoformat(existing_rows[-1]["week_start"])
        if latest_day < previous_week:
            raise OutputSafetyError(
                f"Refusing to replace {config.csv_path.name}: source date {latest_day.isoformat()} "
                f"precedes the existing latest week {previous_week.isoformat()}"
            )

    csv_buffer = io.StringIO(newline="")
    writer = csv.DictWriter(csv_buffer, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)

    complete_week = latest_complete_week(latest_day).isoformat()
    metadata = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "vendor": config.vendor,
        "source": {
            "registry": NPM_REGISTRY,
            "downloads": NPM_DOWNLOADS,
            "weekly_grain": "Monday-start weeks",
            "latest_download_day": latest_day.isoformat(),
            "latest_complete_week_start": complete_week,
            "caveat": "npm counts include automation, mirrors, caches, and dependency installs.",
        },
        "dataset": {
            "csv": config.csv_path.name,
            "rows": len(rows),
            "columns": columns,
            "latest_complete_week_start": complete_week,
        },
        "packages": {
            package: {
                "exists": meta.exists,
                "created": meta.created_raw,
                "modified": meta.modified_raw,
                "latest_version": meta.latest_version,
                "description": meta.description,
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


def run(
    config: VendorConfig,
    *,
    latest_day: date | None = None,
    rebuild: bool = False,
) -> dict:
    """Refresh one npm dataset, fetching only the recent overlap by default."""
    metas = {package: load_package_meta(package, user_agent=config.user_agent) for package in config.packages}
    latest_day = latest_day or latest_download_day(user_agent=config.user_agent)
    columns = ["week_start", *config.packages]
    existing_rows = [] if rebuild else load_existing_rows(config.csv_path, columns)
    downloads: dict[str, dict[date, int]] = {}
    coverage_starts: dict[str, date] = {}
    fetch_starts: dict[str, date] = {}
    for package, meta in metas.items():
        if not meta.exists or not meta.created:
            downloads[package] = {}
            continue
        coverage_start = max(meta.created, EARLIEST_DOWNLOAD_DATE)
        coverage_starts[package] = coverage_start
        fetch_start = coverage_start
        if existing_rows:
            last_existing_week = date.fromisoformat(existing_rows[-1]["week_start"])
            fetch_start = max(
                coverage_start,
                last_existing_week - timedelta(days=INCREMENTAL_OVERLAP_DAYS),
            )
        fetch_starts[package] = fetch_start
        downloads[package] = load_weekly(package, fetch_start, latest_day, user_agent=config.user_agent)
    rows = (
        merge_incremental_rows(existing_rows, metas, downloads, latest_day, coverage_starts, fetch_starts)
        if existing_rows
        else build_rows(metas, downloads, latest_day, coverage_starts)
    )
    write_outputs(rows, metas, latest_day, config)
    return {
        "csv": str(config.csv_path),
        "metadata": str(config.meta_path),
        "rows": len(rows),
        "latest_download_day": latest_day.isoformat(),
    }
