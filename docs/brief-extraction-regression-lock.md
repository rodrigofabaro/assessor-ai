# Brief Extraction Regression Lock

Last updated: 2026-02-19

This file tracks non-negotiable parser behaviors that must not regress.

## Locked Behaviors

- task boundaries stay stable
- table content remains in correct task/part
- false equation warnings are suppressed on non-math briefs
- LO and criteria extraction remains complete for known benchmark briefs
- mapping code progression logic remains stable

## Execution

```powershell
node scripts/brief-lo-extraction.test.js
node scripts/brief-mapping-codes.test.js
node scripts/brief-equation-false-positives.test.js
node scripts/regression-pack.js
```

## Change Rule

Any intentional parser behavior change must include:

1. fixture updates
2. test updates
3. documentation update in this file