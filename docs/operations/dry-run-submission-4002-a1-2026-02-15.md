# Dry Run Playbook - Submission 4002 A1

Date: 2026-02-15  
Project: `assessor-ai-webapp`

## Goal

Run one end-to-end submission through:

1. Ingest (`/api/submissions/upload`)
2. Extract (`/api/submissions/[submissionId]/extract`)
3. Triage/Link (`/api/submissions/[submissionId]/triage`)
4. Grade (`/api/submissions/[submissionId]/grade`)

Then deliberately exercise failure paths where 4002 A1 processing can break.

## Preconditions

- Assignment `4002 A1` exists in `assignment` table.
- `4002 A1` is bound to an assignment brief.
- Brief is locked (`lockedAt` set).
- Unit/spec is locked (`unit.lockedAt` set).
- At least one test student exists (with and without email variants for triage tests).
- OpenAI key configured for grading and OCR fallback tests:
  - `OPENAI_API_KEY` or `OPENAI_ADMIN_KEY` (etc).

## Golden Path (Expected PASS)

Test file:
- `Jane Doe 4002 A1.pdf` with readable text, clear cover page labels:
  - `Student Name: Jane Doe`
  - `jane.doe@example.com`
  - `Unit 4002`
  - `Assignment 1`

Steps:

1. Upload via `/upload` page, select assignment `4002 A1`, upload file.
2. Confirm submission status transitions:
   - `UPLOADED` -> `EXTRACTING` -> `EXTRACTED`
3. Open submission detail page and verify:
   - extraction run status `DONE`
   - non-empty extracted text
   - student linked
   - assignment linked to `4002 A1`
4. Run grade.
5. Confirm grading status transitions:
   - `ASSESSING` -> `DONE`
6. Confirm outputs exist:
   - assessment record
   - feedback text
   - marked PDF path

Evidence to capture:
- submission id
- extraction run id/status/confidence/pageCount
- triage warnings (should be empty or minor)
- assessment id + overall grade
- request ids from API responses (`x-request-id`)

## Failure Scenarios (Where It Can Go Wrong)

| ID | Scenario | How to Trigger | Expected System Behavior | Evidence to Capture |
|---|---|---|---|---|
| F1 | Missing files at upload | POST upload with no `files` entries | `400` with code `UPLOAD_MISSING_FILES` | Response body + request id |
| F2 | Unsupported file type | Upload only `.doc` or `.txt` | `400` with code `UPLOAD_INVALID_FILE_TYPE` | Provided filenames in error details |
| F3 | Mixed valid/invalid file batch | Upload one `.pdf` + one `.txt` | Valid file ingested; invalid file ignored (not created) | Count of created submissions vs uploaded files |
| F4 | Extraction lock/idempotency | Trigger extract twice quickly | Second call returns `ok: true, skipped: true, reason: already-running` | Second extract response payload |
| F5 | Low-text/scanned submission | Upload image-only PDF for 4002 A1 | Extraction run ends `NEEDS_OCR` if meaningful text not produced | run status + `sourceMeta.ocr` metadata |
| F6 | OCR fallback fails or insufficient | Disable key/network or use hard scanned doc | Submission remains `NEEDS_OCR`; grading gate should block | extraction warnings + grading 422 |
| F7 | Triage cannot detect unit/ref | Use filename/content without `4002` or `A1` | Triage warning: missing unit code and/or assignment ref; no auto assignment link | `triage.warnings` |
| F8 | Student ambiguity | Use name matching multiple students (same surname) | No auto-link; warning about ambiguous surname matches | `triage.warnings` + unchanged `studentId` |
| F9 | Placeholder assignment creation | Use `4002 A1` signals when assignment record absent | Auto-creates placeholder assignment (`isPlaceholder: true`) and warns | new assignment row + warning |
| F10 | Grade attempted with weak extraction | Force extracted text too short | `422` `GRADE_EXTRACTION_MISSING` or `GRADE_EXTRACTION_NOT_READY` | error code + blockers/warnings |
| F11 | Assignment brief mapping missing | Remove assignment->brief binding | `422` `GRADE_ASSIGNMENT_BINDING_MISSING` | response body |
| F12 | Brief/spec not locked | Unlocked brief or unit for 4002 A1 | `422` `GRADE_BRIEF_NOT_LOCKED` or `GRADE_SPEC_NOT_LOCKED` | response body |
| F13 | OpenAI key missing | Unset API key env var | `500` `GRADE_OPENAI_KEY_MISSING` | response body |
| F14 | Model response invalid schema | Force malformed model output path | grade fails with `500` `GRADE_FAILED`; submission set to `FAILED` | error message + final submission status |
| F15 | Marked PDF generation failure | Corrupt source file after extraction | grade fails with `500` `GRADE_FAILED`; no valid assessment output | error + missing/invalid annotated PDF |

## Suggested Execution Order

1. Run Golden Path first (prove baseline works for `4002 A1`).
2. Run upload failures (`F1`-`F3`).
3. Run extraction and triage failures (`F4`-`F9`).
4. Run grading gate failures (`F10`-`F15`).

## Pass/Fail Criteria

- PASS: Golden Path completes with `submission.status = DONE` and assessment artifacts present.
- PASS: Each failure scenario returns the expected error code/status and does not silently produce incorrect links/grades.
- FAIL: Any scenario returns success where a hard guard should trigger, or any guard failure is not auditable via status/warnings/events.

## Notes

- This dry run is specific to the current route behavior in:
  - `app/api/submissions/upload/route.ts`
  - `app/api/submissions/[submissionId]/extract/route.ts`
  - `app/api/submissions/[submissionId]/triage/route.ts`
  - `app/api/submissions/[submissionId]/grade/route.ts`
- Re-run this playbook after any pipeline/status-model changes.
