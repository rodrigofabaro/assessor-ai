# Submission Detail Guide (`/submissions/[submissionId]`)

Last updated: 2026-02-24

This is the single-submission grading workspace.

## Layout (Current)

- header (identity + single status line): current state, current step, next action
- at-a-glance summary: student, assignment, extraction, audit output readiness
- left workflow rail (numbered): `1 Cover review` -> `2 Assignment` -> `3 Preview` -> `4 Student` -> `5 Approval & outputs`
- PDF viewer: source and marked outputs
- approval & outputs (decision screen): final confirmation, save actions, feedback editor, criterion decisions
- technical details (collapsed): confidence, readiness checklist, evidence density, rerun diagnostics
- notes chip: fixed bottom-right in viewer for quick page jumps

## Fast Path (Operator Loop)

1. open a submission later from the queue
2. read the header status line (`Action needed`, `Preview ready`, `Audit saved`, `Complete`)
3. follow the highlighted left workflow step only
4. if fixes are required, correct the specific step (`Cover`, `Assignment`, `Student`)
5. preview auto-runs when context is ready (or use `Generate preview`)
6. review `Approval & outputs` (grade, feedback, marked PDF)
7. confirm using:
   - `Save to audit`
   - `Save to audit & next`

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

Tip:

- Use `Apply manual review & regenerate outputs` in `Approval & outputs` when you changed feedback text and/or criterion overrides and want a refreshed marked file before final save.

## Feedback Safety

Student-facing feedback must not expose internal system controls (for example model fallback, strictness tuning, schema issues).

Use:

- page-level notes for evidence coaching
- overall feedback for summary and next actions

## Common Issues

- preview says one grade, editor shows another
  - this usually means an older run is selected
  - use the run selector in outputs and select `Latest`
  - after `Save to audit`, latest run is auto-selected
- page opens in approval stage instead of setup cards
  - this is expected in review-ready mode (fresh preview or saved audit)
  - use the numbered left workflow rail if you need to inspect earlier steps
- grade config model mismatch display
  - refresh page and verify saved model in admin settings
- missing criterion decisions in output
  - check mapped criteria vs excluded criteria snapshot in run JSON
- low confidence despite clear evidence
  - open `Technical details (optional)` and inspect confidence / evidence diagnostics
- notes feel generic or repetitive
  - regenerate marked PDF from the selected run to apply latest notes logic
  - confirm notes appear in bottom-right of marked pages
- repeated regrades produce different criterion decisions
  - review `Diff vs previous run` and `Technical details (optional)` in outputs
  - check QA flags for decision-drift signals before release
- assessor override applied but grade did not update
  - ensure override was applied on the selected run (not a historical run)
  - refresh and confirm selected run grade changed in outputs
  - confirm reason code was selected before apply
