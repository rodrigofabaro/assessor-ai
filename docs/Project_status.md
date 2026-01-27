# Assessor-AI — Project Status

**Status locked on:** 2026-01-27  
**Active phase:** Phase 3.1 — Student registry + manual submission linking (audited)  
**Branch:** phase-3-extraction-engine  
**Maintainer:** Rodrigo

## What is stable
- Upload pipeline (single & batch)
- Submission tracking + lifecycle states
- Extraction runs (per-page) + extracted text storage

## New in this milestone (2026-01-27)
- Student model aligned to: fullName, email, externalRef
- Submission: studentLink audit fields (studentLinkedAt/studentLinkedBy)
- SubmissionAuditEvent table for link/unlink history
- Extraction provenance fields on Submission (extractedTextHash/extractionVersion)

## Data note
- Legacy Student columns `name` and `studentRef` were removed during migration.
- Any values in those columns were discarded (dev DB cleanup).

## What is being built next
- Students API (search/create)
- Submission link/unlink endpoints (writes audit events)
- Submission page UI panel to link students
