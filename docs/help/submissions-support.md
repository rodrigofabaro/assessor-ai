# Submissions Daily Tutorial (`/submissions`)

Route: `http://localhost:3000/submissions`
Last updated: 2026-02-20

Use this tutorial for daily operations from intake to graded outputs.

## 1. Read Queue Pressure First

TODO screenshot: `/help/submissions/01-lane-overview.png`

Check in this order:

- Blocked count
- Needs Human count
- QA review count
- Auto-ready count

If Blocked is high, fix blockers before running grading actions.

## 2. Resolve Linking and Context

TODO screenshot: `/help/submissions/02-row-actions.png`

For each unresolved row:

- open `Resolve`
- confirm student link
- confirm unit/assignment link
- save

Do not run batch grading while assignment links are missing.

## 3. Confirm Extraction State

TODO screenshot: `/help/submissions/03-extraction-status.png`

Expected states:

- `EXTRACTED` for normal flow
- `NEEDS_OCR` for blocked text extraction

When cover-only mode is enabled, short body text can be valid if cover metadata is complete.

## 4. Run QA Safely

TODO screenshot: `/help/submissions/04-qa-preview-commit.png`

Required sequence:

1. open `Batch actions` and run `Preview QA lane`
2. inspect preview result
3. use `Commit QA lane`

Commit is invalid if queue membership changed or preview expired.

## 4b. Use the Primary Batch Action

For standard throughput, use the visible `Grade auto-ready` button first.  
Use `Batch actions` only when you need broader or recovery actions.

## 5. Verify Auto Grading

Rows that are truly `AUTO_READY` should grade automatically after extraction/triage/linking.

If not auto-graded, check:

- assignment has linked brief
- extraction gate passed
- no existing assessment already present
- `SUBMISSION_AUTO_GRADE_ON_EXTRACT=true`

## 6. Troubleshooting

- `Brief extraction quality gate failed`
  - open brief record, fix extraction/mapping, re-lock brief
- `GRADE_NO_ACTIVE_CRITERIA`
  - all criteria were excluded from grading scope for that brief
- row stuck in `FAILED`
  - use `Retry failed` only after root cause is fixed

## Operator Rule

Always resolve Blocked and mapping issues before pushing more volume into grading.
