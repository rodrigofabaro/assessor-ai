# Option 1 — Re-extract a LOCKED reference (overwrite with audit trail)

This patch solves the problem: **a unit/spec is LOCKED, extraction was wrong, and you want to run extraction again without deleting/unlocking**.

What it does:

- **Backend**: `/api/reference-documents/extract` now accepts `forceReextract: true`.
  - If the document is locked and you *don't* pass `forceReextract`, you still get HTTP **423**.
  - If you *do* pass `forceReextract: true`, the endpoint re-runs extraction and overwrites `extractedJson` **while keeping the doc locked**.
  - A compact audit breadcrumb is appended to `sourceMeta.reextractHistory` (previous summary, next summary, timestamp, optional reason).

- **UI**: When a locked document is selected, a **Re-extract (overwrite)** button appears.

## Install

Copy these files into your `webapp` repo (same relative paths) and overwrite:

- `app/api/reference-documents/extract/route.ts`
- `app/admin/reference/reference.logic.ts`
- `app/admin/reference/page.tsx`

Then restart `npm run dev`.
