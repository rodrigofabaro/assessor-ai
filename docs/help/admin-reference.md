# Admin Reference (`/admin/reference`)

Last updated: 2026-03-06

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
- hard-validation attempts and fallback mode are stored in `sourceMeta.hardValidation`

## Brief Extraction Recovery Path

For BRIEF documents, extract now uses a staged recovery path:

1. native extraction
2. native retry with forced structure recovery
3. whole-PDF AI recovery (fallback) when hard validation still fails

If unresolved blockers remain, status is set to `FAILED` (or remains `LOCKED` if document was locked) and warnings are persisted for remediation.

## List API Performance Mode

`GET /api/reference-documents` now supports lean response modes for faster admin page refresh:

- `extracted=none` (smallest payload, no extracted JSON)
- `extracted=summary` (default; lightweight extracted summary)
- `extracted=full` (full extracted JSON for deep edit/review flows)

Current UI behavior (performance hardening):

- inbox list refresh requests `extracted=summary` to keep payloads small
- when an item is selected, the page hydrates full extracted JSON on demand via `GET /api/reference-documents/[documentId]`
- actions are temporarily disabled while full preview hydration is in progress

Pagination parameters:

- `limit` (default `200`, max `500`)
- `offset` (default `0`)
- `includeTotal=true` (adds `page.total` and `page.hasMore`)

## Figures and Diagram References

Brief tasks that reference a figure/diagram should carry `[[IMG:...]]` tokens in extracted task/part text.

- this prevents mismatched diagrams in task rendering
- missing tokens are treated as hard-validation blockers
- extracted figure assets are served via `/api/reference-documents/[documentId]/figure`

## Common Issues

- file path missing in storage
  - fix stored path and re-extract
- recurring extraction warnings
  - validate source PDF quality and parser assumptions
- Pearson criteria text looks mixed/truncated
  - run `scripts/repair-pearson-imported-spec-criteria.cjs`
  - verify `criteriaDescriptionsVerified` is set in `sourceMeta`
