# Admin Specs (`/admin/specs`)

Last updated: 2026-02-24

## Purpose

Specs define the criteria universe used by briefs and grading.

## Workflow

1. upload spec
2. run extraction
3. verify unit metadata, LO list, criteria by LO
4. commit import
5. lock authoritative version

## Page Modes (Operator UX)

`/admin/specs` now has two distinct modes:

- `Library Catalog` (default)
  - use this for reviewing the locked specs register ("spec master")
  - includes health summary, version-family filters, and spec version compare
- `Extraction Inbox`
  - use this for upload, extract/re-extract, and lock actions on incoming spec PDFs

This separation reduces clutter when you are only auditing the catalog.

## Library Catalog Features (Spec Master)

- `Spec Master Health` summary bar
  - locked specs
  - active set coverage
  - unverified Pearson criteria descriptions
  - multi-version families
  - version conflicts (`same code + same issue`)
- quick filters
  - `Active set`, `Favorites`, `Unverified`, `Pearson batch`, `Pearson-set`, `Archived`
- exact unit-code search (supports shorter historical codes too, e.g. `44`)
- numeric unit-code sorting
- favorites/pinning (local browser preference)
- LO/AC count visibility per row

## Version Families (Important)

The catalog distinguishes:

- `Multi-version family` (expected / informational)
  - same unit across different issue dates/versions
  - may also include framework renumbering (same unit title, different unit code)
  - example: a newer code and an older historical code for the same unit title
- `Same-issue conflict` (warning)
  - same unit code and same issue label duplicated
  - requires operator review

Do not treat all repeated unit codes as errors. Version history is normal.

## Spec Version Compare

Use the compare panel in `Library Catalog` to compare units within the same version family.

The panel now reports:

- LO added/removed
- LO text changed
- criteria added/removed
- criteria moved to different LO
- criteria text changed

Use this to confirm what changed between Issue 5 vs Issue 6 (or across framework renumbering).

## Pearson Engineering Suite (Bulk "Spec Master")

For Pearson HN Engineering 2024 suite imports, use the scripted flow instead of manual upload-per-unit.

### Source-of-truth assets (repo)

- `data/pearson/source/btec-hncd-unit-descriptor-engineering-suite-2024.pdf`
- `data/pearson/engineering-suite-2024/manifest.json`
- `data/pearson/engineering-suite-2024/unit-json/*.json`
- `data/pearson/engineering-suite-2024/unit-pdfs/*.pdf`

### Required script order (do not reorder)

1. `node scripts/pearson-unit-descriptor-extract.mjs ...`
2. `node scripts/import-pearson-units-into-reference-specs.cjs ...`
3. `node scripts/repair-pearson-imported-spec-criteria.cjs`
4. `node scripts/lock-imported-pearson-specs.cjs`

Important:
- Run `repair` before `lock` for Pearson imports.
- Do not run `repair` and `lock` in parallel for the same batch.
- Pearson assessment tables are 3-column (`Pass / Merit / Distinction`); the repair step reconstructs criterion descriptions column-wise.

## Pearson Criteria Description Safety Guard

For imported Pearson docs (`importSource = pearson-engineering-suite-2024`):

- `/admin/specs` hides criterion descriptions until `sourceMeta.criteriaDescriptionsVerified = true`
- this prevents operators from seeing mixed/truncated criterion text if the repair step has not run yet

After a successful repair, criteria descriptions display normally.

## Quality Checks

- LO headers complete and ordered
- criteria coverage complete for each LO
- footer noise not polluting LO/criteria text
- issue label and unit code detected correctly
- Pearson imported specs: `criteriaDescriptionsVerified = true` before trusting criterion descriptions in UI
- if multiple versions exist, confirm the intended grading version via `Spec version compare`

## Rule

Do not grade against an unlocked or unverified spec.
