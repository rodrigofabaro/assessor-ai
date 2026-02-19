# `/admin/audit` and `/admin/users` Help

## `/admin/audit`

### Purpose
Operational event log for submission and reference workflows.
Use `/admin/qa` for trend analysis and reporting; use `/admin/audit` for event-level trace evidence.

### Main actions
- Filter and search events
- Inspect event metadata
- Open linked submission/reference records
- Review `QA Preview to Commit Integrity` links for batch grading defensibility

### Notable events
- Extraction transitions
- Grading completed
- Feedback edited (`FEEDBACK_EDITED`)
- Reference lock/failure activity
- Batch grading runs (`BATCH_GRADE_RUN`) with linked preview context for QA lane commits

### QA integrity panel
- Shows recent commit batch runs that claim a linked dry-run preview.
- Displays both request IDs (commit and preview), outcome totals, and a link status.
- `MISSING_PREVIEW` means the commit references a preview request ID that is not present in loaded ops logs and should be investigated.
- The panel also surfaces `GRADE_DRY_RUN_COMPLETED` entries so you can confirm the preview request ID, queue signature, and timestamp before the commit occurred; this highlights whenever a QA commit tries to re-use stale or dropped previews.

## `/admin/users`

### Purpose
Manage app users and active audit actor identity.

### Main actions
- Create/edit active users
- Set active audit user
- Monitor active user count and role spread

### Important behavior
Assessor identity in grading and feedback workflows is derived from active audit user policy.
