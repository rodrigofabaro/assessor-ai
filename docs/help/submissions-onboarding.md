# `/submissions` Onboarding Tutorial (First Run)

## Audience

New operator doing first-time setup validation with a small controlled queue.

## Goal

Process 3 submissions end-to-end and prove that:
- linking works
- lanes classify correctly
- `AUTO_READY` rows grade automatically
- QA preview/commit works with integrity safeguards

## Test dataset recommendation

Prepare 3 files with predictable outcomes:

1. `Sample A` (expected `AUTO_READY`)
- clear student identity
- clear assignment/unit signals
- normal extracted quality

2. `Sample B` (expected `NEEDS_HUMAN`)
- missing or ambiguous student identity
- requires manual `Resolve`

3. `Sample C` (expected `QA review`)
- lower confidence or sparse evidence signal so it appears in QA queue

## Step 0. Confirm environment

Required behavior toggles:
- `SUBMISSION_AUTO_GRADE_ON_EXTRACT=true`
- `SUBMISSION_EXTRACT_COVER_ONLY=true` (recommended Phase 1 default)

Open:
- `/upload`
- `/submissions`
- `/admin/audit`

## Step 1. Upload the 3 samples

- Upload files from `/upload`.
- Wait for rows to appear in `/submissions`.
- Do not run batch grading yet.

Checkpoint:
- You can identify all three rows by filename/search.

## Step 2. Resolve identity blockers first

- In `/submissions`, enable `Unlinked only`.
- Open `Resolve` for unresolved row(s), especially `Sample B`.
- Link to the correct student.

Checkpoint:
- `Sample B` moves out of unresolved identity state.

## Step 3. Validate lane classification

Expected initial lane outcomes:
- `Sample A` in `Auto-Ready` or quickly moving there
- `Sample B` in `Needs Human` until resolved
- `Sample C` in `QA review` (or flagged for QA reasons)

If classification differs:
- open row detail and inspect extraction/quality/warnings
- verify assignment mapping and brief link

## Step 4. Verify auto-grading on `AUTO_READY`

- Watch `Sample A` after extraction + triage complete.
- Do not click `Run` manually.

Expected behavior:
- backend queues grading automatically when automation state is `AUTO_READY`
- row progresses toward graded/completed without manual click

If it does not:
- confirm assignment has `assignmentBriefId`
- confirm no existing assessment run already exists
- confirm `SUBMISSION_AUTO_GRADE_ON_EXTRACT=true`

## Step 5. Run QA preview/commit for `Sample C`

- Click `Preview QA lane`.
- Review preview outcome.
- Click `Commit QA lane` only if queue is unchanged.

Integrity checks:
- commit remains disabled until valid preview exists
- preview expires after 30 minutes
- queue changes force new preview

Checkpoint:
- `Sample C` gets graded through preview->commit, not direct commit.

## Step 6. Validate audit trail

In `/admin/audit`, confirm events exist for your run:
- `GRADE_DRY_RUN_COMPLETED` for QA preview
- `BATCH_GRADE_RUN` for batch operations/commit
- linkage context between preview request and commit request

Checkpoint:
- You can explain which preview produced which QA commit.

## Step 7. Sign-off checklist

- All 3 samples leave unresolved identity state.
- At least 1 row auto-grades from `AUTO_READY` without manual run.
- QA row graded via preview->commit pattern.
- Audit evidence confirms run defensibility.

## Common first-run mistakes

- Running `Grade visible` too early before resolving links.
- Treating `QA review` row as normal batch grade without preview.
- Assuming extracted means auto-graded; `AUTO_READY` is required.
- Ignoring missing brief mapping (`assignmentBriefId`) which blocks auto-trigger.

## Next tutorial

After this onboarding run, use:
- `/help/submissions-support` for daily operations playbook.
