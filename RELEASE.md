# Release 1.0.0

Date: 2026-02-20

## Definition Of Completed

This release is considered complete when the workflows listed under **In Scope** run end-to-end with current docs and no manual code edits.

## In Scope Workflows

1. App configuration and active audit user management from Admin Settings.
2. Reference document ingestion (spec/brief/rubric/IV), extraction, review, and lock workflows.
3. Assignment-to-brief binding and criteria mapping workflows.
4. Submission upload, extraction, triage, student linking, assignment linking, and queue routing.
5. Single and batch grading, including QA preview/commit lane flow.
6. Assessor overrides on criterion decisions and re-grade history handling.
7. Feedback editing, marked PDF generation, and marked-file export flow.
8. QA analytics dataset and audit timeline/event logging.

## Acceptance Checklist (Observable)

1. Upload -> Extract -> Grade -> Marked PDF export succeeds for a sample submission.
2. Each assessment stores a `referenceContextSnapshot` with locked spec/brief context.
3. Assessor criterion override recomputes effective grade and regenerates selected run outputs.
4. QA queue supports preview then commit path with deterministic request linkage.
5. Submissions and QA pages load via server-side pagination/filtering without full-dataset fetch.

## Explicitly Out Of Scope

1. Passive learning from submissions or automatic model self-improvement.
2. Automatic fine-tuning from assessor corrections.
3. New grading policy experiments beyond current implemented guardrails.
4. External LMS direct writeback integrations (current scope is export-ready output).
5. Multi-tenant isolation features.

## Change Control After 1.0.0

1. Any behavior change to grading decisions, caps, or confidence policy requires a new version bump.
2. Any workflow added outside the in-scope list requires updating this file before merge.
3. Release requires a Git tag `v1.0.0` on the merge commit.
4. No silent grading changes: prompts, post-decision guards, grade caps, and contradiction-guard defaults must be documented in `RELEASE_NOTES.md`.
