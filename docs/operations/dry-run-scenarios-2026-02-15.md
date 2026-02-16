# Dry Run Report - Scenario Coverage

Date: 2026-02-15  
Project: `assessor-ai-webapp`

## Scope

This dry run exercised different scenarios across the pipeline stages defined in `docs/standards/truth-model.md`:

1. Ingest
2. Extract
3. Triage/Link
4. Grade
5. Outputs/Operations

It also included repo health gates from `docs/operations/integrity-checks.md`.

## Command Log

| Stage | Command | Result | Notes |
|---|---|---|---|
| Health | `node -v` | PASS | `v20.17.0` |
| Health | `pnpm -v` | PASS | `10.14.0` |
| Health | `pnpm run lint` | PASS (warnings) | 9 lint warnings; no hard failure |
| Health | `pnpm exec tsc --noEmit --incremental false` | PASS | Type safety gate passed |
| Health | `pnpm run build` | PASS | Build completed successfully after server stop; earlier `EPERM` was transient/environmental |
| Extract | `pnpm run test:extraction-readiness` | PASS | Includes good and failing readiness scenarios |
| Extract | `pnpm run test:extraction-integrity` | PASS | Fixture structure/equation/table integrity checks |
| Extract | `node scripts/brief-extract.test.js tmp-brief-target.pdf --out .tmp-dryrun-brief-snapshot.json` | PASS (with parser warnings) | Snapshot written; parser emitted font warnings |
| Triage/Link | `pnpm run test:brief-readiness` | PASS | READY/ATTN/BLOCKED scenarios validated |
| Grade | `pnpm run test:grading-schema` | PASS | Valid, missing evidence, and FAIL->REFER normalization |
| Outputs | `pnpm run test:tasks-tab` | PASS | Task override merge behavior validated |
| Outputs | `pnpm run test:word-math` | PASS | Word linear to LaTeX conversion scenarios |
| Outputs | `pnpm run test:ai-fallback` | PASS | Fallback policy on/off and candidate selection caps |
| Operations | `node scripts/openai-costs-smoketest.js` | PASS | Live costs endpoint returned HTTP 200 |

## Scenario Coverage Summary

- Positive paths validated:
  - extraction ready flow
  - brief ready flow
  - valid grading decision schema
  - outputs/task merge and math conversion flows
  - live OpenAI costs diagnostics route behavior
- Negative/edge paths validated:
  - extraction blocked: `NEEDS_OCR`, low extracted length
  - brief readiness blocked/attention states: missing lock/doc/year/IV, rejected/changes required
  - grading invalid decisions: missing criterion coverage and missing evidence
  - AI fallback disabled vs enabled behavior and max-candidate capping
  - override index drift regression protection in tasks tab logic

## Findings

1. Build gate is healthy after rerun.
- `pnpm run build` now passes and completes route/static generation.
- Earlier `EPERM` errors appear environment/sandbox related, not source compile/type issues.

2. Lint warnings are accumulating in critical paths.
- Unused variables and unstable React hook dependency patterns remain in grading/extraction/admin files.
- Not blocking now, but increases regression risk and review noise.

3. PDF parser warnings are visible during fixture extraction.
- Brief extraction completed, but parser emitted font function warnings.
- This can hide meaningful extraction regressions in noisy logs.

4. Stage 1 (Ingest) has no explicit dry-run script coverage.
- Current checks focus on extract/triage/grade/output internals.
- Upload ingestion and persisted metadata consistency are not explicitly tested by script.

## Improvement Areas (Prioritized)

1. Keep build runbook guard for transient environment locks.
- If `EPERM` occurs, stop dev server/processes and rerun build before treating as code regression.
- Keep optional pre-build cleanup for `.next` in local/CI environments with lock contention.

2. Raise lint bar gradually to prevent quality drift.
- Resolve existing warnings in:
  - `app/admin/briefs/components/BriefReviewCard.tsx`
  - `app/admin/briefs/[briefId]/briefDetail.logic.ts`
  - `app/admin/briefs/[briefId]/components/tasks/tasksTab.logic.ts`
  - `app/admin/briefs/[briefId]/components/TasksTab.tsx`
  - `lib/extraction/text/pdfToText.ts`
  - `lib/extractors/brief.ts`
  - `lib/grading/markedPdf.ts`
  - `lib/openai/briefMathCleanup.ts`

3. Add ingest-stage dry-run test script.
- Proposed script: `scripts/ingest-readiness.test.js`.
- Validate upload metadata fields, status transitions, and file-to-record invariants.

4. Reduce extraction noise and add warning thresholds.
- Classify parser warnings into expected vs actionable.
- Fail dry run only when warning counts/types exceed baseline.

5. Add one end-to-end pipeline smoke.
- One scripted path from ingest -> extract -> readiness -> grade schema validation with fixture data.
- Keep deterministic and offline-capable.

## Final Status

- Dry run executed across all defined stages with scenario variation.
- Functional logic checks: PASS.
- Operational blockers: none in final rerun.
- Documentation generated from this run: `docs/operations/dry-run-scenarios-2026-02-15.md`.
