# `/admin/audit` and `/admin/users` Help

## `/admin/audit`

### Purpose
Operational event log for submission and reference workflows.
Use `/admin/qa` for trend analysis and reporting; use `/admin/audit` for event-level trace evidence.

### Main actions
- Filter and search events
- Inspect event metadata
- Open linked submission/reference records

### Notable events
- Extraction transitions
- Grading completed
- Feedback edited (`FEEDBACK_EDITED`)
- Reference lock/failure activity

## `/admin/users`

### Purpose
Manage app users and active audit actor identity.

### Main actions
- Create/edit active users
- Set active audit user
- Monitor active user count and role spread

### Important behavior
Assessor identity in grading and feedback workflows is derived from active audit user policy.
