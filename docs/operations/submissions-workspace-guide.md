# Submissions Workspace Guide (`/submissions`)

Date: 2026-02-16  
Route: `/submissions`

## Phase 1 Operating Mode (Current)

- Use cover-first processing for student submissions:
  - `SUBMISSION_EXTRACT_COVER_ONLY=true`
  - `SUBMISSION_EXTRACT_COVER_PAGE_LIMIT=2` (or `1..3`)
- The submission PDF remains source-of-truth.
- Grading decisions are evidence-linked to page context, not full-body reconstruction.
- Cover metadata is used for:
  - identity checks
  - triage/linking fallback
  - extraction readiness confidence

## What This Page Is For

`/submissions` is the operations workspace for submission intake and progression.
It helps tutors/admins:

- monitor upload and processing status
- resolve unlinked students
- review readiness for grading/export
- run batch grading on visible rows
- open each submission for full detail/audit

This page is designed as the "queue board" between upload and final marked outputs.

## Current UI Structure

1. Header + summary cards
- Visible submissions count
- Need student link count
- Extracted count
- Export-ready count

2. Toolbar controls
- `Unlinked only`
- `Ready to upload`
- Timeframe: `Today` / `This week` / `All`
- Search input
- Status filter
- `Grade visible`
- `Retry failed`
- `Refresh`
- `Upload`

3. Grouped table (by uploaded date)
- File
- Student
- Assignment
- Status
- Next action (derived)
- Uploaded date
- Row actions: `Open`, `Copy summary`, `Resolve`

4. Resolve drawer
- Runs triage on selected submission
- Shows detected name/email and warnings
- Searches student records
- Links selected student to submission

## Operational Flow (How To Use)

1. Upload files via `/upload` or `Upload` button.
2. In `/submissions`, use `Unlinked only` and open `Resolve` for unmatched rows.
3. Confirm status progression (`UPLOADED` -> `EXTRACTING` -> `EXTRACTED` / `NEEDS_OCR`).
4. Filter to target rows and run `Grade visible` (or `Retry failed`).
5. Open submission details for audit of extraction, triage, and assessment outputs.
6. Use `Copy summary` for LMS/Totara handoff where applicable.

## Notes For Cover-Only Runs

- Short/missing body text is expected in `COVER_ONLY` mode and should not be treated as automatic failure.
- Triage now uses latest extraction run `sourceMeta.coverMetadata` before falling back to filename-only heuristics.
- If linking fails, operator action is still required (manual resolve), but false negatives are reduced.

## Strengths

- Single operational workspace for queue management.
- Clear status and next-action signaling.
- Fast triage loop with in-context student linking.
- Batch actions reduce repetitive grading clicks.
- Derived readiness checks prevent premature export actions.
- Backend returns latest assessment summary fields directly (`grade`, `feedback`, `markedPdfPath`).

## Flaws / Gaps

- Automation still depends on manual filter setup and repeated refresh.
- No real-time queue updates (polling/manual refresh only).
- No SLA indicators (e.g., "stuck in EXTRACTING > X min").
- No explicit queue segmentation (Ready, Blocked, Needs Human).
- Batch grade controls are broad; no "safe auto-run policy" presets.
- Limited exception workflows for `NEEDS_OCR` and assignment mismatch handling.
- Copy-summary is useful but still a manual export handoff.

## Recommended UI Improvements For A More Automated Version

### 1) Replace generic list with queue lanes

Add top-level lanes:

- `Auto-Ready`
- `Needs Human`
- `Blocked`
- `Completed`

Each row should carry a deterministic "automation state" from backend rules.

### 2) Add automation policy panel

Introduce policy toggles:

- Auto-link student when confidence >= threshold
- Auto-grade only when extraction gate passes and assignment binding is locked
- Auto-retry failed once (with cooldown)
- Auto-hold rows with OCR/triage ambiguities

Show policy version + last changed by for audit.

### 3) Event-driven updates

- WebSocket/SSE for status transitions
- Inline progress chips (extracting, assessing, retry queued)
- Remove reliance on manual refresh

### 4) Exception inbox

Dedicated tab for exceptions:

- `NEEDS_OCR`
- `GRADE_ASSIGNMENT_BINDING_MISSING`
- ambiguous student linking
- repeated failures

Each exception should have recommended resolution actions and one-click deep links.

### 5) Safer batch operations

- Preview list before execution (who will be graded and why)
- Dry-run mode for batch actions
- Per-row reason for skipped items
- Cancel/pause queue controls

### 6) Better time/ownership controls

- Assignee field (owner of row)
- "Time in current state"
- Aging heatmap + escalation badge

### 7) Export automation

- Convert `Copy summary` into first-class export jobs
- One-click package generation and status tracking
- Immutable export history per submission

## Suggested Next Implementation Slice

1. Add backend `automationState` + `automationReason` for each submission.
2. Render queue lanes from these states in `/submissions`.
3. Add `Exceptions` lane first (`NEEDS_OCR`, binding missing, triage ambiguous).
4. Add real-time updates (SSE) for status changes.
5. Add batch dry-run preview before executing grade jobs.

This sequence improves reliability and operator speed without large schema churn.
