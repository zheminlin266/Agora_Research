# Dashboard data pipeline

## Published artifacts

The download dashboard publishes six datasets under:

```text
public/data/dev-npm-downloads/
├── Data/*.csv
├── json/*_metadata.json
└── manifest.json
```

The datasets are Agora npm, Agora PyPI, LiveKit npm, LiveKit PyPI, Twilio npm, and Tencent TRTC npm. Each CSV has a `week_start` column followed by package columns. The matching metadata records the dataset columns, source, generation time, and `source.latest_complete_week_start`.

There is also a separate quarterly metrics file at `public/data/agora_quarterly_key_metrics.json`, rendered by `/Resources/Agora_Key_Metrics/`.

## Sources and entry points

| Dataset | Source | Selective command |
| --- | --- | --- |
| Agora npm | npm Downloads API | `python scripts/update_dashboard_data.py --dataset agoraNpm` |
| Agora PyPI | PyPI metadata and ClickPy/ClickHouse | `python scripts/update_dashboard_data.py --dataset agoraPypi` |
| LiveKit npm | npm Downloads API | `python scripts/update_dashboard_data.py --dataset livekitNpm` |
| LiveKit PyPI | PyPI metadata and ClickPy/ClickHouse | `python scripts/update_dashboard_data.py --dataset livekitPypi` |
| Twilio npm | npm Downloads API | `python scripts/update_dashboard_data.py --dataset twilioNpm` |
| Tencent TRTC npm | npm Downloads API | `python scripts/update_dashboard_data.py --dataset rtcNpm` |

Running `python scripts/update_dashboard_data.py` refreshes all six datasets. It
uses an overlapping recent window and merges it into the existing CSV by
default. Use `--rebuild` for a full historical refresh.

The updater uses bounded retries for transient responses, file locks for concurrent runs, temporary files with `fsync`, and atomic replacement. A failed or suspicious refresh must leave the previous CSV/metadata pair intact.

## Value semantics

- A blank value means the package was not observable before its API coverage or first upload date, or the upstream registry has missing statistics for that week. It is unknown, not zero. Charts preserve the time interval and break the line at missing weeks.
- `0` means the package was inside the observed range and the source reported no downloads for that week.
- Every `week_start` is an ISO Monday. Rows are continuous seven-day intervals.
- Each chart and its latest-week metrics use its own dataset's latest complete Monday-to-Sunday week. A delayed source must not truncate another source's charts. A trailing partial week may remain in the CSV but must not appear in charts or latest-week metrics.
- The overview shows separate npm and PyPI complete-week dates (the earliest complete week within each registry). Each package also displays its dataset's cutoff date so readers can identify different reporting periods.
- Package columns and metadata columns must match exactly. Values are non-negative integers or blank.

## Failure policy

Only a confirmed upstream `404` may be interpreted as a missing package. `429`, `403`, `5xx`, timeout, malformed response, range-query failure, empty output, schema changes, row-count collapse, or latest-week rollback are refresh failures. They must be retried where supported or terminate without overwriting the prior artifacts.

Do not hand-edit production CSVs. If a source changes its schema or coverage, update the builder and its tests first, then regenerate the affected CSV and metadata together.

### npm source incident and recovery checked on 2026-11-08

The npm `last-day` endpoint now ends on 2026-11-07. Registry-wide daily
statistics still report zero downloads on October 6, 14–15, and 19–21. See
the [upstream issue report](https://github.com/orgs/community/discussions/211210).
Matching package `point` and `range` totals do not establish complete coverage.

The builder now validates daily range boundaries, dates, counts, and package
identity, and requires every requested day. It checks registry-wide totals
alongside package downloads. A registry-wide zero marks the entire affected
week as unknown; legitimate package zeros remain zero. Missing weeks are
recorded in `source.incomplete_week_starts`, retained as blank CSV cells,
and rendered as line breaks. A later week with complete statistics can be
published without treating the intervening outage as a fall in adoption.
The latest complete-week cutoff cannot fall within a missing week or move
backwards. Source-date rollback protection remains in place.

All six datasets were refreshed through November 7. Charts and latest-week
metrics show the complete week of October 26–November 1; the November 2
partial week remains in the CSV. npm weeks starting October 5, 12, and 19
are unknown, including the previously published October 5 total now confirmed
to contain a missing day. Earlier history before the overlap is preserved.
Year-over-year comparisons use the week exactly 52 weeks earlier, preserving
the calendar relationship across missing observations.

## Verification

Run the offline validator after every refresh:

```powershell
npm run validate:data
npm test
npm run typecheck
npm run build
```

Review the CSV/metadata diff for source, complete week, row count, package columns, blank-versus-zero behavior, and unexpected historical changes. Commit the generator change and the generated artifacts in the same PR. Never publish a manually copied file that is not represented by Git.
