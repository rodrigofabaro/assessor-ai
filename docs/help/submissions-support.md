# `/submissions` Tutorial: Daily Operator Workflow

## Goal

Use this tutorial to process a queue from upload-ready to graded outputs safely, with minimal manual intervention.

Route: `http://localhost:3000/submissions`

## Before you start

- You should have at least one uploaded submission.
- Student and assignment data should already exist in the system.
- For automatic grading on `Auto-Ready` rows, environment flag must be enabled:
- `SUBMISSION_AUTO_GRADE_ON_EXTRACT=true`

## Step 1. Read queue health first

![Submissions header and quick metrics](/help/submissions/submissions-header.png)

- Open `/submissions`.
- Check top metrics in this order:
- `Missing` count first (identity blockers)
- `Blocked` lane pressure second (OCR/extraction issues)
- `QA` queue size third (manual quality control workload)

Expected result:
- You know whether to start with linking fixes, blocker resolution, or QA preview/commit.

## Step 2. Narrow to actionable rows

![Submissions toolbar filters and actions](/help/submissions/submissions-toolbar.png)

- Start with `Unlinked only` ON.
- Resolve student links until this filter has no critical rows left.
- Use search for student filename/email fragments when queue is large.
- Keep broad batch actions (`Grade visible`) for controlled situations only.

Expected result:
- Remaining rows have enough identity context to progress.

## Step 3. Work lanes in priority order

![Submission lanes and row actions](/help/submissions/submissions-lanes.png)

Recommended lane order:

1. `Blocked`
- Fix extraction/OCR and mapping blockers first.

2. `Needs Human`
- Resolve uncertain links, ambiguous data, and warnings.

3. `QA review`
- Use preview/commit pattern (step 5).

4. `Auto-Ready`
- Usually no click needed now; auto-grading triggers when state is truly `AUTO_READY`.

5. `Completed`
- Spot-check only, then handoff/export.

Expected result:
- Queue drains predictably without skipping hard blockers.

## Step 4. Resolve one row deeply when needed

![Submission detail workspace](/help/submissions/submissions-resolve-drawer.png)

- Click `Open` on problematic rows.
- Validate evidence, assignment context, and extraction quality.
- If student link is missing, return to row action `Resolve` and link correctly.
- After linking/extraction/triage updates, row may become `AUTO_READY` and auto-grade.

Expected result:
- Ambiguous rows move back to an automatable state.

## Step 5. Run QA safely (Preview -> Commit)

- Click `Preview QA lane` first.
- Review results and queue composition.
- Click `Commit QA lane` only if preview matches current queue.

Rules:
- Commit is blocked until a valid preview exists.
- Preview expires after 30 minutes.
- Queue membership changes invalidate preview linkage.

Expected result:
- QA grading decisions remain auditable and defensible.

## Step 6. Verify automation worked

- Watch `Auto-Ready` rows: they should transition into grading without manual `Run`.
- Refresh queue and confirm status progression toward `Completed`.
- If a row did not auto-grade, use troubleshooting below.

## Troubleshooting playbook

### Problem: Row remains `Needs Human`

- Confirm student is linked.
- Confirm assignment is linked.
- Confirm assignment has locked brief mapping.
- Check extraction warnings in row detail.

### Problem: Row is `Auto-Ready` but grading did not run

- Refresh once, then recheck lane/status.
- Confirm `SUBMISSION_AUTO_GRADE_ON_EXTRACT=true`.
- Confirm row has no existing assessment (duplicates are intentionally blocked).
- Confirm assignment has `assignmentBriefId`.

### Problem: `Commit QA lane` disabled

- Rerun `Preview QA lane`.
- Ensure queue did not change after preview.
- Ensure preview is less than 30 minutes old.

## What changed in this version

- `AUTO_READY` transitions now trigger grading automatically from backend transitions (extract, triage, linking routes).
- Operators no longer need to manually click run for rows that are already automation-safe.

## New team onboarding

For first-time setup and a controlled 3-sample validation run, use:
- `/help/submissions-onboarding`
