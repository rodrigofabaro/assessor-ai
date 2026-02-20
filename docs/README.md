# Assessor AI Documentation

Last updated: 2026-02-20

This folder is the operational source of truth for extraction, mapping, grading, and audit workflows.

## Start Here

1. Standards and constraints: `docs/standards/truth-model.md`
2. Brief extraction internals: `docs/brief-extraction.md`
3. Grading hardening architecture: `docs/operations/grading-hardening-system.md`
4. Submission operations runbook: `docs/operations/phase1-submission-grading-runbook.md`
5. End-to-end weakness review: `docs/operations/extraction-grading-weakness-review-2026-02-19.md`
6. Template and UI/UX recommendations: `docs/operations/template-ui-ux-recommendations-2026-02-19.md`
7. Route help center: `docs/help/README.md`

## Scope Map

- Briefs
  - extraction/parser behavior
  - quality gates before lock
  - mapping health and criterion exclusions
- Specs
  - LO and criteria parsing
  - import and locking behavior
- Submissions
  - extraction readiness
  - triage and automation
  - grading policy and confidence
  - marked PDF outputs

## Verification Commands

Run these before shipping extraction/grading changes:

```powershell
pnpm exec tsc --noEmit --incremental false
node scripts/tasks-tab.logic.test.js
node scripts/ai-fallback-policy.test.js
node scripts/word-linear-math.test.js
node scripts/grading-schema.test.js
node scripts/grading-confidence.test.js
node scripts/grading-input-strategy.test.js
node scripts/extraction-readiness.test.js
node scripts/extraction-integrity.test.js
node scripts/brief-readiness.test.js
node scripts/brief-mapping-codes.test.js
node scripts/brief-lo-extraction.test.js
node scripts/brief-equation-false-positives.test.js
node scripts/regression-pack.js
```

## Current Baseline

As of 2026-02-20, the full extraction/grading scripted suite passes locally.

Navigation baseline updates:

- `/submissions/[submissionId]` and `/admin/settings` load as lazy client modules for faster route transitions.
- `/submissions` uses a single upload entrypoint (`Upload assignment`) and compact batch controls (`Batch actions` menu).

## Documentation Rules

- Keep docs implementation-accurate.
- If behavior changes, update docs in the same branch.
- Do not hide known weaknesses; log them in operations docs with severity and owners.
