# Submissions Workspace Guide

Route: `/submissions`
Last updated: 2026-02-20

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
