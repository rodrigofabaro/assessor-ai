# Submission Detail Guide (`/submissions/[submissionId]`)

Last updated: 2026-02-20

This is the single-submission grading workspace.

## Layout

- top status strip: blockers and primary next action
- PDF viewer: source and marked outputs
- left rail: compact collapsible cards
- audit and outputs: run history, criterion decisions, feedback editor
- feedback history: per-run `Expand/Collapse` for full text review
- notes chip: fixed bottom-right in viewer for quick page jumps

## Fast Path

1. confirm student/assignment links
2. confirm extraction quality
3. run grading (or wait for auto grading)
4. review criterion decisions and evidence pages
5. verify marked PDF and student-safe feedback
6. commit grade and verify latest run is selected in editor

## Criterion Overrides (Assessor)

Use this when assessor judgement disagrees with model criterion decisions.

1. Open `Criterion Decisions` in outputs.
2. For any criterion, set:
   - `Final decision`
   - `Reason`
   - optional assessor note
3. Click `Apply override`.

System behavior:

- Saves audit-safe override metadata per criterion:
  - model decision
  - final assessor decision
  - reason code
  - note
  - actor + timestamp
- Recomputes final grade policy from overridden criterion decisions.
- Regenerates marked PDF and page notes from effective decisions.
- Shows override state inline (`Overridden`) on criterion rows.

## Feedback Safety

Student-facing feedback must not expose internal system controls (for example model fallback, strictness tuning, schema issues).

Use:

- page-level notes for evidence coaching
- overall feedback for summary and next actions

## Common Issues

- preview says one grade, editor shows another
  - this usually means an older run is selected
  - use the run selector in outputs and select `Latest`
  - after `Commit grade`, latest run is auto-selected
- grade config model mismatch display
  - refresh page and verify saved model in admin settings
- missing criterion decisions in output
  - check mapped criteria vs excluded criteria snapshot in run JSON
- low confidence despite clear evidence
  - check readiness checks, missing evidence ratio, and modality gaps
- notes feel generic or repetitive
  - regenerate marked PDF from the selected run to apply latest notes logic
  - confirm notes appear in bottom-right of marked pages
- repeated regrades produce different criterion decisions
  - review `Diff vs previous run` and `GradeRun v2 signals` in outputs
  - check QA flags for decision-drift signals before release
- assessor override applied but grade did not update
  - ensure override was applied on the selected run (not a historical run)
  - refresh and confirm selected run grade changed in outputs
  - confirm reason code was selected before apply
