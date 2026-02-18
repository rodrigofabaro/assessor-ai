# `/admin/audit` and `/admin/users` Help

## `/admin/audit`

### Purpose
Unified audit trail for submission and reference operations.

### Main actions
- filter/search events
- inspect event metadata
- open linked submission/reference records

### Notable events
- extraction transitions
- grading completed
- feedback edited (`FEEDBACK_EDITED`)
- reference lock/failure activity

## `/admin/users`

### Purpose
Manage app users and active audit actor identity.

### Main actions
- create/edit active users
- set active audit user

### Important behavior
Assessor identity in grading/feedback workflows is derived from active audit user policy.
