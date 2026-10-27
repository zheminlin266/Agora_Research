import io
import json
import tempfile
import unittest
import urllib.error
from datetime import date
from pathlib import Path
from unittest.mock import patch

from lib.npm_dashboard import (
    PackageMeta,
    VendorConfig,
    build_rows,
    fetch_json,
    iter_ranges,
    latest_complete_week,
    load_package_meta,
    load_weekly,
    merge_incremental_rows,
    parse_iso_date,
    run,
    week_start,
    write_outputs,
)
from lib.dashboard_outputs import OutputSafetyError


class _Response:
    def __init__(self, payload: bytes):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self):
        return self.payload


def _http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://example.test", code, "failure", {}, io.BytesIO())


class NpmDashboardTests(unittest.TestCase):
    def test_date_helpers(self):
        self.assertEqual(parse_iso_date("2026-08-08T12:00:00Z"), date(2026, 8, 8))
        self.assertEqual(week_start(date(2026, 8, 8)), date(2026, 8, 3))
        self.assertEqual(latest_complete_week(date(2026, 8, 8)), date(2026, 7, 27))

    def test_iter_ranges_is_contiguous_and_bounded(self):
        ranges = list(iter_ranges(date(2020, 1, 1), date(2022, 1, 1)))
        self.assertGreater(len(ranges), 1)
        self.assertEqual(ranges[0][0], date(2020, 1, 1))
        self.assertEqual(ranges[-1][1], date(2022, 1, 1))
        for previous, current in zip(ranges, ranges[1:]):
            self.assertEqual(previous[1].toordinal() + 1, current[0].toordinal())

    def test_fetch_json_retries_transient_http_failure(self):
        with patch("lib.npm_dashboard.urllib.request.urlopen", side_effect=[_http_error(503), _Response(b'{"ok": true}')]), patch("lib.npm_dashboard.time.sleep"):
            self.assertEqual(fetch_json("https://example.test", user_agent="test", retries=2), {"ok": True})

    def test_only_confirmed_404_is_treated_as_missing_package(self):
        with patch("lib.npm_dashboard.fetch_json", side_effect=_http_error(404)):
            self.assertFalse(load_package_meta("missing", user_agent="test").exists)
        with patch("lib.npm_dashboard.fetch_json", side_effect=_http_error(403)):
            with self.assertRaises(urllib.error.HTTPError):
                load_package_meta("forbidden", user_agent="test")

    def test_range_404_is_not_silently_dropped(self):
        with patch("lib.npm_dashboard.fetch_json", side_effect=_http_error(404)):
            with self.assertRaises(urllib.error.HTTPError):
                load_weekly("demo", date(2024, 1, 1), date(2024, 1, 7), user_agent="test")

    def test_build_rows_aligns_weekly_values(self):
        metas = {"demo": PackageMeta(exists=True, created=date(2024, 1, 2), created_raw="2024-01-02T00:00:00Z")}
        downloads = {"demo": {date(2024, 1, 1): 7}}
        rows = build_rows(metas, downloads, date(2024, 1, 14))
        self.assertEqual(rows, [{"week_start": "2024-01-01", "demo": "7"}, {"week_start": "2024-01-08", "demo": "0"}])

    def test_unknown_history_before_api_coverage_is_blank(self):
        metas = {"legacy": PackageMeta(exists=True, created=date(2011, 1, 1), created_raw="2011-01-01T00:00:00Z")}
        downloads = {"legacy": {date(2015, 1, 5): 3}}
        rows = build_rows(metas, downloads, date(2015, 1, 11), {"legacy": date(2015, 1, 10)})
        by_week = {row["week_start"]: row["legacy"] for row in rows}
        self.assertEqual(by_week["2014-12-29"], "")
        self.assertEqual(by_week["2015-01-05"], "3")

    def test_incremental_rows_update_overlap_and_append_new_weeks(self):
        metas = {"demo": PackageMeta(exists=True, created=date(2024, 1, 2))}
        rows = merge_incremental_rows(
            [
                {"week_start": "2024-01-01", "demo": "7"},
                {"week_start": "2024-01-08", "demo": "8"},
            ],
            metas,
            {"demo": {date(2024, 1, 8): 80, date(2024, 1, 15): 9}},
            date(2024, 1, 21),
            {"demo": date(2024, 1, 2)},
            {"demo": date(2024, 1, 8)},
        )
        self.assertEqual(rows, [
            {"week_start": "2024-01-01", "demo": "7"},
            {"week_start": "2024-01-08", "demo": "80"},
            {"week_start": "2024-01-15", "demo": "9"},
        ])

    def test_incremental_rows_preserve_history_before_refresh_window(self):
        rows = merge_incremental_rows(
            [
                {"week_start": "2024-01-01", "demo": "0"},
                {"week_start": "2024-01-08", "demo": "7"},
            ],
            {"demo": PackageMeta(exists=True, created=date(2024, 1, 10))},
            {"demo": {date(2024, 1, 8): 80, date(2024, 1, 15): 9}},
            date(2024, 1, 21),
            {"demo": date(2024, 1, 10)},
            {"demo": date(2024, 1, 8)},
        )
        self.assertEqual(rows[0]["demo"], "0")
        self.assertEqual(rows[1]["demo"], "80")

    def test_write_outputs_writes_csv_and_metadata_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = VendorConfig("demo", ["demo"], root / "data.csv", root / "metadata.json")
            rows = [{"week_start": "2024-01-01", "demo": "7"}]
            metas = {"demo": PackageMeta(exists=True, created=date(2024, 1, 2), created_raw="2024-01-02T00:00:00Z")}
            write_outputs(rows, metas, date(2024, 1, 7), config)
            self.assertTrue(config.csv_path.is_file())
            self.assertTrue(config.meta_path.is_file())
            metadata = json.loads(config.meta_path.read_text(encoding="utf-8"))
            self.assertEqual(metadata["dataset"]["rows"], 1)
            self.assertEqual(metadata["dataset"]["columns"], ["week_start", "demo"])
            self.assertEqual(config.csv_path.read_bytes(), b"week_start,demo\n2024-01-01,7\n")

    def test_source_date_rollback_is_rejected_with_unchanged_row_shape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = VendorConfig("demo", ["demo"], root / "data.csv", root / "metadata.json")
            metas = {"demo": PackageMeta(exists=True, created=date(2024, 1, 2))}
            rows = [{"week_start": "2024-01-01", "demo": "7"}, {"week_start": "2024-01-08", "demo": "9"}]
            write_outputs(rows, metas, date(2024, 1, 14), config)
            before = (config.csv_path.read_bytes(), config.meta_path.read_bytes())
            changed_rows = [dict(row, demo="0") for row in rows]
            with self.assertRaisesRegex(OutputSafetyError, "source date moved backwards"):
                write_outputs(changed_rows, metas, date(2024, 1, 12), config)
            self.assertEqual(before, (config.csv_path.read_bytes(), config.meta_path.read_bytes()))

    def test_source_date_rollback_uses_csv_when_metadata_date_is_unavailable(self):
        for metadata_text in (None, '{"source": {}}\n'):
            with self.subTest(metadata=metadata_text), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                config = VendorConfig("demo", ["demo"], root / "data.csv", root / "metadata.json")
                metas = {"demo": PackageMeta(exists=True, created=date(2024, 1, 2))}
                rows = [{"week_start": "2024-01-01", "demo": "7"}, {"week_start": "2024-01-08", "demo": "9"}]
                write_outputs(rows, metas, date(2024, 1, 14), config)
                if metadata_text is None:
                    config.meta_path.unlink()
                else:
                    config.meta_path.write_text(metadata_text, encoding="utf-8")
                before = (config.csv_path.read_bytes(), config.meta_path.read_bytes() if config.meta_path.exists() else None)
                with self.assertRaisesRegex(OutputSafetyError, "precedes the existing latest week"):
                    write_outputs(rows, metas, date(2024, 1, 7), config)
                after = (config.csv_path.read_bytes(), config.meta_path.read_bytes() if config.meta_path.exists() else None)
                self.assertEqual(before, after)

    def test_run_rejects_source_date_rollback_in_incremental_and_rebuild_modes(self):
        for rebuild in (False, True):
            with self.subTest(rebuild=rebuild), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                config = VendorConfig("demo", ["demo"], root / "data.csv", root / "metadata.json")
                meta = PackageMeta(exists=True, created=date(2024, 1, 2))
                rows = [{"week_start": "2024-01-01", "demo": "7"}, {"week_start": "2024-01-08", "demo": "9"}]
                write_outputs(rows, {"demo": meta}, date(2024, 1, 14), config)
                before = (config.csv_path.read_bytes(), config.meta_path.read_bytes())
                with patch("lib.npm_dashboard.load_package_meta", return_value=meta), patch("lib.npm_dashboard.load_weekly", return_value={}):
                    with self.assertRaisesRegex(OutputSafetyError, "source date moved backwards"):
                        run(config, latest_day=date(2024, 1, 12), rebuild=rebuild)
                self.assertEqual(before, (config.csv_path.read_bytes(), config.meta_path.read_bytes()))

    def test_empty_output_is_rejected_without_touching_existing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = VendorConfig("demo", ["demo"], root / "data.csv", root / "metadata.json")
            metas = {"demo": PackageMeta(exists=True, created=date(2024, 1, 2), created_raw="2024-01-02T00:00:00Z")}
            write_outputs([{"week_start": "2024-01-01", "demo": "7"}], metas, date(2024, 1, 7), config)
            before = (config.csv_path.read_bytes(), config.meta_path.read_bytes())
            with self.assertRaises(OutputSafetyError):
                write_outputs([], metas, date(2024, 1, 7), config)
            self.assertEqual(before, (config.csv_path.read_bytes(), config.meta_path.read_bytes()))

    def test_pair_write_rolls_back_if_metadata_replace_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = VendorConfig("demo", ["demo"], root / "data.csv", root / "metadata.json")
            metas = {"demo": PackageMeta(exists=True, created=date(2024, 1, 2), created_raw="2024-01-02T00:00:00Z")}
            old_rows = [{"week_start": "2024-01-01", "demo": "7"}]
            new_rows = [{"week_start": "2024-01-01", "demo": "9"}]
            write_outputs(old_rows, metas, date(2024, 1, 7), config)
            before = (config.csv_path.read_bytes(), config.meta_path.read_bytes())
            import lib.dashboard_outputs as outputs

            real_replace = outputs.os.replace
            calls = 0

            def flaky_replace(source, target):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError("simulated metadata replace failure")
                return real_replace(source, target)

            with patch("lib.dashboard_outputs.os.replace", side_effect=flaky_replace):
                with self.assertRaises(OSError):
                    write_outputs(new_rows, metas, date(2024, 1, 7), config)
            self.assertEqual(before, (config.csv_path.read_bytes(), config.meta_path.read_bytes()))

    def test_output_schema_change_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = VendorConfig("demo", ["demo"], root / "data.csv", root / "metadata.json")
            metas = {"demo": PackageMeta(exists=True, created=date(2024, 1, 2), created_raw="2024-01-02T00:00:00Z")}
            write_outputs([{"week_start": "2024-01-01", "demo": "7"}], metas, date(2024, 1, 7), config)
            expanded = VendorConfig("demo", ["demo", "extra"], root / "data.csv", root / "metadata.json")
            expanded_metas = {
                "demo": metas["demo"],
                "extra": PackageMeta(exists=True, created=date(2024, 1, 2), created_raw="2024-01-02T00:00:00Z"),
            }
            with self.assertRaises(OutputSafetyError):
                write_outputs(
                    [{"week_start": "2024-01-01", "demo": "8", "extra": "1"}],
                    expanded_metas,
                    date(2024, 1, 7),
                    expanded,
                )

    def test_latest_week_rollback_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = VendorConfig("demo", ["demo"], root / "data.csv", root / "metadata.json")
            metas = {"demo": PackageMeta(exists=True, created=date(2024, 1, 2), created_raw="2024-01-02T00:00:00Z")}
            write_outputs(
                [{"week_start": "2024-01-01", "demo": "7"}, {"week_start": "2024-01-08", "demo": "9"}],
                metas,
                date(2024, 1, 14),
                config,
            )
            with self.assertRaises(OutputSafetyError):
                write_outputs([{"week_start": "2024-01-01", "demo": "8"}], metas, date(2024, 1, 7), config)


if __name__ == "__main__":
    unittest.main()
