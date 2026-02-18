# Phase 1 Submission Grading Runbook

Date: 2026-02-18  
Scope: Cover extraction + direct document grading (no full body reconstruction)

## Purpose

This runbook defines the operator flow for reliable grading in Phase 1:

- extract only what is required from cover pages
- link to locked brief/spec
- grade with evidence-linked decisions
- keep audit records complete

## Required Environment

Set in `.env`:

- `SUBMISSION_EXTRACT_COVER_ONLY=true`
- `SUBMISSION_EXTRACT_COVER_PAGE_LIMIT=2`
- `OPENAI_GRADE_PAGE_SAMPLE_COUNT=4`
- `OPENAI_GRADE_PAGE_SAMPLE_CHAR_LIMIT=1600`
- `SUBMISSION_AUTO_GRADE_ON_EXTRACT=true`
- `SUBMISSION_AUTO_REGRADE_ON_COVER_UPDATE=true`

Optional override:

- Set `SUBMISSION_EXTRACT_COVER_ONLY=false` only for exceptional troubleshooting.

Additional safeguards:

- `GRADE_MAPPING_ALIGNMENT_MIN_RATIO` (default `0.65`)
- `GRADE_MAPPING_MISMATCH_MAX` (default `2`)
- `GRADING_MIN_PAGE_COUNT` (default `1`)
- `GRADING_MAX_WARNINGS_BEFORE_BLOCK` (default `8`)
- `REQUIRE_BRIEF_REVIEW_CONFIRM` (optional, `true` to require review confirmation on brief lock)
- `ENFORCE_ADMIN_MUTATIONS` (optional, `true` to restrict sensitive mutations to active ADMIN user)

## Required Admin Settings (Grading)

In `/admin/settings` -> `Grading`:

- feedback template must include:
  - `{overallGrade}`
  - `{feedbackBullets}`
- page-note controls:
  - enable/disable page notes
  - note tone (`supportive`, `professional`, `strict`)
  - max pages with notes
  - max notes per page
  - include criterion code flag

## Grade Vocabulary (Pearson HN)

Only these overall grades are valid:

- `REFER`
- `PASS`
- `PASS_ON_RESUBMISSION`
- `MERIT`
- `DISTINCTION`

## Operator Flow

1. Upload submission PDF.
2. Run extraction (auto-grade runs automatically when links are complete).
3. Confirm extraction mode shows `COVER_ONLY`.
4. Check cover metadata card:
- student fields present where available
- unit/assignment signals look correct
5. Run triage/linking:
- ensure submission is linked to the correct student
- ensure assignment binding points to the intended locked brief/spec
6. Review readiness panel:
- clear actionable warnings
- ignore non-actionable short-body warnings in cover-only mode
7. If required, run grading manually (auto path should already run in most cases).
8. Validate output:
- criterion decisions include page-linked evidence
- overall grade is from allowed vocabulary
 - marked PDF includes:
   - overall summary on final page
   - constructive notes only on mapped evidence pages (when enabled)
9. Lock/continue workflow only after evidence + grade are coherent.

## Warning Handling Matrix

`task body: suspiciously short`
- In cover-only mode: informational unless other blockers exist.
- Action: proceed if cover metadata is ready and page evidence is available.

`equation quality: low-confidence`
- Action: verify equation-critical criteria manually before lock.

`missing/short document text`
- In cover-only mode: expected.
- Action: rely on page samples + PDF view; do not fail automatically.

`cover metadata incomplete`
- Non-blocking in cover-only mode.
- Action: update fields directly in submission detail and save.
- System re-runs grading automatically to refresh personalized feedback (first-name greeting).

`page note mismatch`
- Action: use `Regenerate with current settings` in `Audit & outputs`.
- This rebuilds the marked PDF without re-running AI grading.

`assignment binding missing`
- Action: block grading until linked to locked brief/spec.

`criteria mapping mismatch`
- Error code: `GRADE_CRITERIA_MAPPING_MISMATCH`
- Action: re-open brief mapping, re-lock brief, then regrade impacted submissions.

`student unresolved`
- Action: run resolve flow and link student before grading.

## Hard Rules

- No criterion may be `ACHIEVED` without page-linked evidence.
- Do not promote confidence purely from heuristics.
- Do not treat extraction confidence alone as grading validity.
- If warnings remain visible, either resolve them or classify as non-actionable with rationale.
- Assessor identity is from active audit user (system policy), not manual entry in submission detail.

## Audit Checklist (Before Finalization)

- original PDF stored
- cover metadata extraction stored
- locked brief ID/version stored
- locked spec ID/version stored
- structured grading JSON stored
- model + prompt hash stored
- grading timestamp stored
- criteria mapping snapshot stored (`mapped vs extracted`, overlap, mismatch count)
- ops event written for lock/grade/batch operations

## Operations Endpoints

- Mapping drift report:
  - `GET /api/admin/ops/mapping-drift`
- Operational metrics:
  - `GET /api/admin/ops/metrics`
- Ops event log tail:
  - `GET /api/admin/ops/events?limit=100`

## When To Escalate To Manual Review

- page evidence is ambiguous for pass/fail boundary
- chart/table/equation evidence is unclear for required criteria
- unit/assignment link is uncertain
- structured output and narrative feedback disagree
