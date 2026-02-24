# Submissions Workspace Guide

Route: `/submissions`
Last updated: 2026-02-24

## What This Page Is

Queue control for intake, linking, triage, and batch workflows.

## What This Page Is Not

It is not the final place to validate detailed criterion evidence. Use submission detail for that.

## Recommended Queue Order

1. Blocked
2. Needs Human
3. QA review
4. Auto-ready
5. Completed

## Batch Safety

- use QA preview before QA commit
- do not batch grade rows with unresolved blockers
- always review skipped reasons from batch result

## Detail Page Loop (Current Operator Flow)

For `/submissions/[submissionId]` (single submission review):

1. Open the row later from the queue.
2. Read the single status line in the header (`Action needed`, `Preview ready`, `Audit saved`, `Complete`).
3. Follow the numbered left workflow rail only for the highlighted step.
4. When preview is fresh (or audit is already saved), review `Approval & outputs`.
5. Confirm grade + feedback + marked PDF readiness.
6. Use:
   - `Save to audit`
   - `Save to audit & next`

Notes:

- Review-ready submissions auto-open `Approval & outputs`.
- Technical diagnostics (confidence/readiness internals) are hidden under `Technical details (optional)` so the main review path stays focused.

## Current Controls (2026-02-20)

- Header has a single upload entrypoint: `Upload assignment`.
- Primary batch button: `Grade auto-ready`.
- Secondary batch actions are grouped under `Batch actions`:
  - Grade visible
  - Preview QA lane
  - Commit QA lane
  - Retry failed
  - Regrade impacted
- Compact lane pills summarize pressure (`Auto`, `Human`, `Blocked`, `Done`, `QA`).

## Known UX Pressure Points

- lane card density can require excess scrolling
- right-side controls can crowd evidence workspace

See `docs/operations/template-ui-ux-recommendations-2026-02-19.md` for redesign proposals.
