# Admin Briefs (`/admin/briefs`, `/admin/briefs/[briefId]`)

Last updated: 2026-02-24

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

## Brief vs Spec Audit (New Lock Guard)

Before lock, the mapping panel now runs a `Brief vs Spec Audit` against the selected locked spec.

Audit checks (in order):

1. unit code match (brief vs selected spec)
2. unit title/name match (similarity check)
3. LO codes referenced in the brief
4. AC codes and LO-to-AC mapping
5. criterion text drift (warning-level, best effort)

### Outcomes

- `BLOCKER`
  - wrong unit code
  - major unit title mismatch
  - unknown LO
  - LO/AC mapping mismatch
- `WARNING`
  - unit title drift
  - criterion text drift vs spec
- `INFO`
  - parser could not confidently read some brief criterion text (code-level checks still run)

Locking is blocked when structural blockers are present.

## Why This Matters

This catches common brief mistakes before grading:

- wrong unit bound to the brief
- outdated or edited criterion text
- criteria listed under the wrong LO
- framework/version confusion

## Criterion Exclusion Controls

Library criteria pills can be toggled out of grading scope per brief.

- active criteria: normal pill
- excluded criteria: red pill with `x`
- confirmation prompt required on toggle

If all criteria are excluded, grading is blocked by policy.

## Common Failures

- `BRIEF_EXTRACTION_QUALITY_GATE_FAILED`
  - mapping incomplete, extraction too short, or brief-vs-spec audit blockers
- missing LO text in overview
  - verify spec extraction and lock state
- stale lock/extract status mismatch
  - re-open brief detail and refresh extraction card state
