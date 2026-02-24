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

## Rule

Do not grade against an unlocked or unverified spec.
