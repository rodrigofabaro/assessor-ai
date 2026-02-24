# Admin Reference (`/admin/reference`)

Last updated: 2026-02-24

## Purpose

Reference inbox for uploaded docs (specs/briefs) with extract/lock lifecycle.

## Workflow

1. upload and extract
2. inspect warnings
3. review parsed content
4. lock when reliable

## Bulk Imports (Pearson Suite)

Bulk spec imports can be created by scripts and still flow through the same extract/review/lock lifecycle.

- imported Pearson engineering suite rows use `sourceMeta.importSource = pearson-engineering-suite-2024`
- these rows may be created as `EXTRACTED`, then repaired, then `LOCKED`
- use `/admin/specs` to inspect parsed LO/criteria output before or after locking

## Lock Rules

- locked docs are immutable unless explicit force re-extract is requested
- force re-extract on locked docs must keep history in source metadata

## Common Issues

- file path missing in storage
  - fix stored path and re-extract
- recurring extraction warnings
  - validate source PDF quality and parser assumptions
- Pearson criteria text looks mixed/truncated
  - run `scripts/repair-pearson-imported-spec-criteria.cjs`
  - verify `criteriaDescriptionsVerified` is set in `sourceMeta`
