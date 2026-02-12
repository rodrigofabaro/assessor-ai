# (Archived) Fix brief workbench state, extraction, lock UX, and safe delete

> Archived reference task. Kept for historical context. Do not reuse blindly; update scope, paths and acceptance tests for the current codebase.

## Governing rules
- Read and follow: [NON_NEGOTIABLES](../../NON_NEGOTIABLES.md)

## TASK
Make brief extraction and refresh immediate, improve task extraction robustness, handle lock conflicts gracefully, and support safe deletion when unused.

## CONTEXT
Brief extraction returns headers but tasks were missing. Extracted data only appeared after a manual refresh. The Refresh button sometimes navigated users away from the active workspace. Locking a brief could fail with a known 409 conflict that should be handled with dedicated UX. Admins needed a safe delete for unused brief uploads.

## SCOPE LIMITS (historical)
- `lib/extractors/brief.ts`
- `app/api/reference-documents/extract/route.ts`
- `app/api/reference-documents/[documentId]/route.ts`
- `app/admin/reference/reference.logic.ts`
- `app/admin/briefs/**`

## ACCEPTANCE TESTS
- Extract a brief and confirm the header/tasks render immediately without a manual reload.
- Click Refresh and confirm the current tab remains active while data refetches.
- Verify tasks[] contains Task 1/2/3 for the provided brief.
- Attempt to lock a brief that conflicts and confirm a modal provides actionable choices.
- Delete an unused brief and confirm it is removed; attempt delete on a brief with submissions and confirm it is blocked.

## FAILURE MODES
- If a brief is locked elsewhere, do not override it silently.
- If a delete is blocked due to submissions, explain why.
