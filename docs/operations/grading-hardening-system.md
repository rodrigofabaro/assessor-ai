# Grading Hardening System

Date: 2026-02-19
Scope: briefs, specs, submissions, grading confidence, audit traceability

## Core Objective

Grade only when reference context, extraction readiness, and evidence integrity are all reliable.

## Hardening Layers

1. Reference integrity
- specs and briefs must be extracted and locked
- brief lock enforces mapping quality gate

2. Submission extraction gate
- extraction status, confidence, page count, and warnings are evaluated
- blocked runs do not proceed to grading

3. Adaptive grading input strategy
- `EXTRACTED_TEXT` when extraction is strong
- `RAW_PDF_IMAGES` when extraction is weak for PDFs

4. Decision schema validation
- grade payload is validated against required criterion coverage
- achieved criteria without evidence are rejected

5. Grade policy normalization
- band completion caps (missing merit/distinction rules)
- resubmission cap policy

6. Confidence scoring policy
- weighted base on model confidence, criterion confidence, and evidence density
- no extraction penalty by policy
- optional bonus only at maximal extraction confidence

7. Audit payload completeness
- reference snapshot
- criteria snapshot (including exclusions)
- input strategy snapshot
- confidence policy and caps
- rerun drift diff against previous assessment

## Auto Grading Trigger Rules

Auto grading is attempted only when automation state resolves to `AUTO_READY`.

Minimum requirements:

- student linked
- assignment linked to a brief
- no existing assessment
- extraction gate not blocked

## Blocking Errors

- `BRIEF_EXTRACTION_QUALITY_GATE_FAILED`
- `GRADE_EXTRACTION_GATE_FAILED`
- `GRADE_CRITERIA_MAPPING_MISMATCH`
- `GRADE_NO_ACTIVE_CRITERIA`
- `GRADE_DECISION_EVIDENCE_MISSING`

## Operational Principle

When reliability is uncertain, block or degrade gracefully with explicit audit details. Never silently pass.

## 2026-02-20 Hardening Additions

1. Brief-specific decision guards
- Deterministic post-model guards can override criterion decisions when required evidence patterns are missing.
- Current guard in production:
  - Unit `4004` / Assignment `A1` / Criterion `M2`
  - Requires explicit alternative milestone monitoring method evidence plus justification/comparison.

2. Run synchronization in assessor workspace
- After commit, the latest assessment run is auto-selected to prevent stale-editor decisions.

3. Student note quality controls
- Note generator removes placeholder/ellipsis artifacts and favors concise action-oriented coaching.
- Marked PDF notes are rendered bottom-right for consistent student scanning.

## Robust-Grading Backlog (recommended)

1. Criterion calibration suite
- Maintain locked calibration submissions for each brief (pass/merit/distinction + borderline).
- Run calibration automatically on model/prompt/config changes.

2. Cross-run drift controls
- Flag and optionally block promotion when criterion decisions change materially without new evidence/extraction improvements.

3. Evidence sufficiency contracts
- Per criterion minimums:
  - citation count
  - page spread
  - rationale specificity score
- Reject `ACHIEVED` when sufficiency contract fails.

4. Structured disagreement loop
- Capture assessor disagreement as labeled data:
  - criterion code
  - disagreement reason
  - corrected decision
  - expected evidence pattern
- Feed into guard rules and prompt refinements.

5. Rubric-normalization layer
- Parse free-form rubric support notes into criterion-level hints.
- Map hints into consistent rule primitives (`must_include`, `exclude_if_only`, `comparison_required`, etc.).
