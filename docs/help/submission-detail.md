# Submission Detail Guide (`/submissions/[submissionId]`)

Last updated: 2026-02-19

This is the single-submission grading workspace.

## Layout

- top status strip: blockers and primary next action
- PDF viewer: source and marked outputs
- left rail: compact collapsible cards
- audit and outputs: run history, criterion decisions, feedback editor

## Fast Path

1. confirm student/assignment links
2. confirm extraction quality
3. run grading (or wait for auto grading)
4. review criterion decisions and evidence pages
5. verify marked PDF and student-safe feedback

## Feedback Safety

Student-facing feedback must not expose internal system controls (for example model fallback, strictness tuning, schema issues).

Use:

- page-level notes for evidence coaching
- overall feedback for summary and next actions

## Common Issues

- grade config model mismatch display
  - refresh page and verify saved model in admin settings
- missing criterion decisions in output
  - check mapped criteria vs excluded criteria snapshot in run JSON
- low confidence despite clear evidence
  - check readiness checks, missing evidence ratio, and modality gaps