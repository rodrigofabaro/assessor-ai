# Brief Extraction Regression Lock

Last updated: 2026-03-06

This file tracks non-negotiable parser behaviors that must not regress.

## Locked Behaviors

- task boundaries stay stable
- table content remains in correct task/part
- false equation warnings are suppressed on non-math briefs
- false missing-scenario warnings are suppressed on tasks that do not explicitly request scenario/context
- UniCourse template-aware extraction profile remains active with generic fallback scoring
- mixed part-key parsing remains stable (`1/2/3`, `i/ii`, `b.i`)
- LO and criteria extraction remains complete for known benchmark briefs
- mapping code progression logic remains stable

## Execution

```powershell
node scripts/brief-lo-extraction.test.js
node scripts/brief-template-profile.test.js
node scripts/brief-mapping-codes.test.js
node scripts/brief-equation-false-positives.test.js
node scripts/regression-pack.js
```

## Change Rule

Any intentional parser behavior change must include:

1. fixture updates
2. test updates
3. documentation update in this file
