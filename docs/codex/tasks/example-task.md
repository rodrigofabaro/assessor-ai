# Example Codex Task: Add brief archive banner

## Governing rules
- Read and follow: [NON_NEGOTIABLES](../NON_NEGOTIABLES.md)

## TASK
Add a clear “Archived” banner/badge to archived briefs in the admin UI.

## CONTEXT
Archived briefs should remain queryable, but must be visually obvious.
Current issue: archived records appear identical to active records in `/admin/briefs`.

## SCOPE LIMITS
- Touch ONLY:
  - `app/admin/briefs/**` (UI rendering only)
- Do not change extraction, locking, or grading semantics.
- No new dependencies.

## ACCEPTANCE TESTS
- Load `/admin/briefs` and confirm archived briefs render an “Archived” badge.
- Verify active briefs do not show the badge.
- Verify archived briefs remain clickable/viewable.

## FAILURE MODES
- If the brief record does not contain an archive flag, show no badge and do not guess.

## EVIDENCE REQUIRED IN PR
- Screenshot of `/admin/briefs` showing the badge.
- File path(s) changed.
