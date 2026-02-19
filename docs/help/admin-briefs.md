# Admin Briefs (`/admin/briefs`, `/admin/briefs/[briefId]`)

Last updated: 2026-02-19

## Purpose

Manage brief extraction, mapping health, and lock readiness.

## Workflow

1. extract/re-extract brief
2. review task quality and warnings
3. validate mapping health
4. lock only after quality gate passes

## Quality Gate Signals

- selected vs matched criteria
- band distribution (P/M/D)
- extraction text length reliability
- mapping blockers/warnings

## Criterion Exclusion Controls

Library criteria pills can be toggled out of grading scope per brief.

- active criteria: normal pill
- excluded criteria: red pill with `x`
- confirmation prompt required on toggle

If all criteria are excluded, grading is blocked by policy.

## Common Failures

- `BRIEF_EXTRACTION_QUALITY_GATE_FAILED`
  - mapping incomplete or extraction too short
- missing LO text in overview
  - verify spec extraction and lock state
- stale lock/extract status mismatch
  - re-open brief detail and refresh extraction card state