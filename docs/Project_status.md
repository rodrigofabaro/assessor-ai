# Assessor-AI — Project Status

Last updated: 2026-01-27

## Where we are

**Phase 3 — Extraction Engine (active)**

What is working now:

- Upload single/batch PDFs/DOCX → creates a Submission record.
- Upload now **auto-starts extraction** (no extra click).
- Extraction stores:
  - `SubmissionExtractionRun` (run metadata)
  - `ExtractedPage[]` (per-page text + confidence)
- Triage attempts to detect unit / assignment / student (best-effort) without silently creating students.

## Why this stage matters

Extraction is the "eyes" of the system. Bad extraction leads to confident nonsense grading, so we’re locking this down before any assessment logic.

## Next milestone

**Phase 3.1 — Manual student linking + audit (in progress)**

- Simple UI to link a submission to an existing student (or create + link).
- Store audit events in `SubmissionAuditEvent`.

## After that

**Phase 4 — AI Grading Engine**

- Strict JSON outputs per criterion (decision + evidence)
- Overall grade + constructive feedback
- Marker checks and full traceability
