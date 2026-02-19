# Submissions Onboarding (`/submissions`)

Last updated: 2026-02-19

Use this for first-day validation with 3 controlled samples.

## Sample Set

1. clean auto-ready case
2. missing student link case
3. QA review case

## Environment

Set and confirm:

- `SUBMISSION_AUTO_GRADE_ON_EXTRACT=true`
- `SUBMISSION_EXTRACT_COVER_ONLY=true` (if running cover-first mode)

## Validation Steps

1. upload 3 files
2. resolve missing links
3. confirm lane placement
4. verify one row auto-grades without manual run
5. run QA preview then commit on QA row
6. check audit events in `/admin/audit`

## Pass Criteria

- no unresolved identity blockers
- auto-ready automation works
- QA preview/commit safety works
- audit trail contains matching run context