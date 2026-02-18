# `/submissions` Help

## Purpose

Queue workspace for operational processing between upload and final outputs.

## Key controls

- Filters:
  - `Unlinked only`
  - `Ready to upload`
  - timeframe
  - status
  - lane filter
  - search
- Actions:
  - `Grade visible`
  - `Retry failed`
  - lane-specific batch actions
  - `Open` row
  - `Resolve` row (student linking)
  - `Copy summary`

## How to use

1. Filter to target submissions.
2. Resolve unlinked students first.
3. Run extraction/grading actions in batch where safe.
4. Open a row for deep review in `/submissions/[submissionId]`.

## Lanes

- `Auto-ready`: usually safe to progress.
- `Needs human`: requires operator check.
- `Blocked`: cannot proceed until blocker resolved.
- `Completed`: processed workflow items.

## Common issue

- Batch grade skipped many rows:
  - check row readiness (student/assignment link, extraction status)
  - open skipped rows and resolve blockers
