# Grading Hardening System (GradeRun v2)

Date: 2026-02-19  
Scope: submission grading reliability, QA defensibility, and automation safety

## Why this hardening exists

The grading pipeline now treats reliability and auditability as first-class constraints.
Grade execution is allowed only when readiness, mapping, and QA integrity checks are satisfied.

## Core hardening pillars

## 1. Readiness and extraction quality gates

- Each submission is evaluated through extraction readiness + quality scoring.
- Route hints are deterministic: `AUTO_READY`, `NEEDS_REVIEW`, `BLOCKED`.
- Low quality/OCR-required states are blocked before grading.
- Automation state is derived from links, status, quality, and existing assessment outcomes.

## 2. Auto-ready controlled automation

- Backend now queues grade runs automatically only when derived automation state is exactly `AUTO_READY`.
- Trigger points include extraction completion, triage updates, and student linking routes.
- Auto-trigger is guarded by:
- `SUBMISSION_AUTO_GRADE_ON_EXTRACT=true`
- linked assignment brief (`assignmentBriefId`)
- no existing assessment run (duplicate-run prevention)

## 3. QA preview -> commit integrity

- QA commit grading requires a prior QA preview for the same queue signature.
- Preview links include request ID, queue signature, timestamp, and queue size.
- Preview validity expires after 30 minutes.
- Queue membership drift invalidates preview/commit pairing.
- Commit payload echoes preview context for audit traceability.

## 4. Audit event defensibility

- Dry runs emit `GRADE_DRY_RUN_COMPLETED`.
- Batch runs emit `BATCH_GRADE_RUN` with:
- succeeded/failed/skipped counters
- dryRun/retry flags
- preview context linkage
- automation policy and operation reason (when required)
- This supports post-run forensic validation in `/admin/audit`.

## 5. Grade policy normalization

- Preview responses include both `rawOverallGrade` and policy-normalized `overallGrade`.
- Policy metadata captures cap/resubmission decisions.
- Evidence-density and extraction-gate summaries are returned for QA review.

## Runtime flow (simplified)

1. Submission is extracted and triaged.
2. Automation state is derived from deterministic signals.
3. If state is `AUTO_READY`, backend sends grade request automatically.
4. For QA lane workflows, operators preview first, then commit.
5. Audit log stores all run-linkage metadata.

## Environment and policy switches

- `SUBMISSION_AUTO_GRADE_ON_EXTRACT` (default `true`)
- `SUBMISSION_AUTO_REGRADE_ON_COVER_UPDATE` (default `true`)
- `AUTO_READY_MIN_QUALITY_SCORE`
- `BLOCKED_MAX_QUALITY_SCORE`
- `QA_LOW_CONFIDENCE_THRESHOLD`
- `ENFORCE_ADMIN_MUTATIONS` (optional policy tightening)

## Operational checks

- `GET /api/admin/ops/events` for event-link verification
- `/admin/audit` for event-level traceability and QA integrity panel
- `/submissions` lane views for automation-state monitoring

