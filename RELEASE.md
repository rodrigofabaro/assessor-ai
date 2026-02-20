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

## Explicitly Out Of Scope

1. Passive learning from submissions or automatic model self-improvement.
2. Automatic fine-tuning from assessor corrections.
3. New grading policy experiments beyond current implemented guardrails.
4. External LMS direct writeback integrations (current scope is export-ready output).
5. Multi-tenant isolation features.

## Change Control After 1.0.0

1. Any behavior change to grading decisions, caps, or confidence policy requires a new version bump.
2. Any workflow added outside the in-scope list requires updating this file before merge.
