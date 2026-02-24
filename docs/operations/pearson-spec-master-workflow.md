# Pearson Spec Master Workflow (Engineering Suite 2024)

Last updated: 2026-02-24

## Purpose

Maintain a local "spec master" for Pearson HN Engineering unit descriptors:

- split the suite PDF into per-unit PDFs
- extract per-unit JSON/text
- import into `/admin/specs`
- repair Pearson 3-column assessment criteria descriptions
- lock into `/admin/library`

This is the supported bulk workflow for Pearson HN Engineering specs.

## Source Asset

- `data/pearson/source/btec-hncd-unit-descriptor-engineering-suite-2024.pdf`

## Generated Assets

- `data/pearson/engineering-suite-2024/manifest.json`
- `data/pearson/engineering-suite-2024/unit-pdfs/*.pdf`
- `data/pearson/engineering-suite-2024/unit-text/*.txt`
- `data/pearson/engineering-suite-2024/unit-json/*.json`

Optional extra batches can be stored separately (example):

- `data/pearson/engineering-suite-2024-extra-4005-4007/...`

## Scripts

- `scripts/pearson-unit-descriptor-extract.mjs`
- `scripts/import-pearson-units-into-reference-specs.cjs`
- `scripts/repair-pearson-imported-spec-criteria.cjs`
- `scripts/lock-imported-pearson-specs.cjs`

## Standard Run Order

1. Extract/split units from the suite PDF

```bash
node scripts/pearson-unit-descriptor-extract.mjs \
  --list data/pearson/unit-lists/engineering-active-units-2024.json \
  --outDir data/pearson/engineering-suite-2024
```

2. Import extracted units into `ReferenceDocument` (`SPEC`)

```bash
node scripts/import-pearson-units-into-reference-specs.cjs \
  --manifest data/pearson/engineering-suite-2024/manifest.json
```

3. Repair Pearson criteria descriptions (required)

```bash
node scripts/repair-pearson-imported-spec-criteria.cjs
```

4. Lock/import into library tables (`Unit`, `LearningOutcome`, `AssessmentCriterion`)

```bash
node scripts/lock-imported-pearson-specs.cjs
```

## Critical Rule (Pearson Criteria Table)

Pearson unit descriptors store assessment criteria in a 3-column table (`Pass / Merit / Distinction`).

- generic flattened-text parsing can mix or truncate criterion descriptions
- the repair script parses PDF text with coordinate-based column grouping
- `repair` must run before trusting criterion descriptions in `/admin/specs` or `/admin/library`

Do not run `repair` and `lock` in parallel for the same new batch.

## Verification in UI

### `/admin/specs`

- Imported Pearson docs use `sourceMeta.importSource = pearson-engineering-suite-2024`
- Criteria descriptions are hidden until `sourceMeta.criteriaDescriptionsVerified = true`
- After repair, criteria descriptions display normally
- `Library Catalog` is the preferred review mode for the locked spec master
- `Extraction Inbox` is for upload/extract/lock operations

### Version families vs conflicts

In the catalog:

- `Multi-version family` means multiple versions of the same unit (normal)
  - can include same unit title with different unit codes across frameworks/time periods
- `Same-issue conflict` means duplicate records for the same unit code + same issue label (needs review)

### `/admin/library`

- Locked unit specs should reflect repaired criterion descriptions after `lock` runs

## Spot-check Protocol (Recommended)

Before locking a new bulk batch, verify at least 3-5 units in `/admin/specs`:

- one common/core unit (example `4001`, `4002`)
- one project/Pearson-set unit (example `4004`, `5002`)
- one subject-specific elective (example `4030`)

Check:

- unit code/title correct
- LO list complete and ordered
- criterion codes complete by LO
- criterion descriptions read cleanly (no mixed `Pass/Merit/Distinction` text)
- if multiple versions exist, use spec version compare to confirm the intended issue/framework version

## Known Status Metadata

Pearson imported specs may carry:

- `sourceMeta.importSource = "pearson-engineering-suite-2024"`
- `sourceMeta.criteriaDescriptionsVerified = true`
- `sourceMeta.criteriaDescriptionsVerifiedAt`
- `sourceMeta.criteriaDescriptionsVerifiedBy = "pearson-column-repair"`

## Notes

- Duplicate unit codes can exist across pathways in the suite PDF. Extraction uses `code + title similarity` matching.
- The local "spec master" files are intended to speed future imports and repairs, not to replace Pearson as the awarding-body source.
