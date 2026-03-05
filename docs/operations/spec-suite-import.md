# Spec Suite One-Time Import

Use this when you receive a full framework PDF (for example the Pearson Engineering descriptor suite) and need to split/import all units into `ReferenceDocument` rows.

## In-app path (preferred)

Use:

`Admin > Specs > Extraction Inbox > Full descriptor import (beta)`

This path uploads one full descriptor PDF, creates an async import job, splits units server-side, and imports/updates suite `SPEC` documents.
When the job completes, download the JSON report from the job status block for QA evidence.

## Command

```bash
pnpm run ops:spec-suite-import-once
```

## What it does

1. Builds/refreshes a manifest from the full descriptor PDF (unit-level split files + metadata) when needed.
2. Imports or updates each unit as `type=SPEC` in `ReferenceDocument`.
3. Writes framework/category metadata for catalog filtering:
   - `framework=Pearson BTEC Higher Nationals Engineering Suite (2024)`
   - `category=Engineering`
4. Locks imported specs (default behavior).

## Optional flags

```bash
node scripts/import-spec-suite-once.cjs --rebuildManifest=true --lock=true
```

Flags:
- `--manifest` manifest path (default `data/pearson/engineering-suite-2024/manifest.json`)
- `--list` unit list JSON
- `--src` source directory containing full PDF
- `--out` output directory for split unit PDFs
- `--pdf` source PDF filename
- `--status` imported reference status (default `EXTRACTED`)
- `--lock` `true|false` (default `true`)
- `--rebuildManifest` `true|false` (default `false`)
