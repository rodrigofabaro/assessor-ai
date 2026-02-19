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