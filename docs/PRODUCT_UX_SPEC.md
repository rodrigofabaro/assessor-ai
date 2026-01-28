# Assessor‑AI — Product UX Spec

Goal: make daily marking **fast**, **audit‑safe**, and **pleasant**.

## Core screens

### Upload
- Multi‑file upload (single or batch).
- Optional pickers: Assignment and Student.
- Default workflow is *inbox‑first*: upload now, resolve student/assignment after.
- Clear instructions + a simple “Uploaded X files” confirmation.

### Submissions (Queue)
- The queue is the home screen for daily use.
- Must support: Today filter, status filter, free‑text search.
- Each row shows: File, Student, Assignment, Status, Next action, Uploaded time.
- Group by day so a tutor can say “What came in today?” instantly.

### Submission Detail (Workspace)
- Split view:
  - Left: PDF preview.
  - Right: extracted text (per‑page) + extraction confidence.
- Student linking panel:
  - Search student by name/email/ID.
  - Link/unlink with an actor stamp.
- “Upload back to Totara” card:
  - Grade (word‑grade only).
  - Feedback (copy/download).
  - Marked PDF (download).

### Admin (Later)
- User management (if the company shares the tool).
- Prompt/version management (so QA can reproduce outcomes).
- Reference library: specs/briefs upload and mapping.

## UX rules
- No hidden states. If something is running, show it.
- “Next action” should always be obvious.
- Prefer defaults over configuration (daily use beats flexibility).

## What is explicitly out of scope (for now)
- Automatic upload back to Totara.
- AI chat at upload time.
- ZIP import directly from Totara exports.

These can be added later without changing the core workflow.
