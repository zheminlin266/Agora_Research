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

- A blank value means the package was not observable before its API coverage or first upload date. It is unknown, not zero.
- `0` means the package was inside the observed range and the source reported no downloads for that week.
- Every `week_start` is an ISO Monday. Rows are continuous seven-day intervals.
- The published complete week is the latest Monday-to-Sunday week available across all six datasets. A trailing partial week may remain in the CSV but must not be used as the dashboard's complete-week cutoff.
- Package columns and metadata columns must match exactly. Values are non-negative integers or blank.

## Failure policy

Only a confirmed upstream `404` may be interpreted as a missing package. `429`, `403`, `5xx`, timeout, malformed response, range-query failure, empty output, schema changes, row-count collapse, or latest-week rollback are refresh failures. They must be retried where supported or terminate without overwriting the prior artifacts.

Do not hand-edit production CSVs. If a source changes its schema or coverage, update the builder and its tests first, then regenerate the affected CSV and metadata together.

### npm source incident observed on 2026-10-27

The official npm relative-date endpoints (`last-day`, `last-week`, and
`last-month`) currently end on 2026-07-01. Explicit recent ranges also contain
registry-wide zero-download days, including October 19–21. Matching `point`
and `range` totals therefore do not establish complete weekly coverage. See
the [upstream issue report](https://github.com/orgs/community/discussions/211210).

Keep the previously published npm files while this source is incomplete. The
npm writer rejects a source-date rollback even when incremental merging retains
the old CSV's final row and row count. PyPI can be refreshed independently:

```powershell
python scripts/update_dashboard_data.py --dataset agoraPypi --dataset livekitPypi
```

For this refresh, PyPI's complete week advances to 2026-10-19; the dashboard's
shared cutoff remains 2026-10-05. Remove or replace the dated bilingual notice
in `components/download-dashboard.tsx` when a later refresh verifies that npm
has recovered. Do not infer recovery solely from a newer requested range end.

## Verification

Run the offline validator after every refresh:

```powershell
npm run validate:data
npm test
npm run typecheck
npm run build
```

Review the CSV/metadata diff for source, complete week, row count, package columns, blank-versus-zero behavior, and unexpected historical changes. Commit the generator change and the generated artifacts in the same PR. Never publish a manually copied file that is not represented by Git.
