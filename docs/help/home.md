# `/` Home Dashboard Help

Last updated: 2026-03-06


## Purpose

Post-login command center with role-specific focus:
- `ASSESSOR`: grading flow and queue intervention
- `ORG_ADMIN`: team operations and access governance
- `SUPER_ADMIN`: platform governance and deployment readiness

## Main actions

- Role-aware primary buttons are shown in the hero panel.
- The stat card set changes by role scope (assessor vs org admin vs super admin).
- `Operational pulse` and `Suggested next actions` are role-specific.
- Role-aware action cards route to the correct work lane:
  - Assessor lane: `Submissions`, `Specs`, `QA`, `Users`
  - Org admin lane: `Submissions`, `Users`, `QA`, `Audit`
  - Super admin lane: `Developer`, `Users`, `Specs`, `Audit`

## How to use

1. Confirm your role badge and organization scope in the hero section.
2. Use role-specific primary actions to enter the right lane directly.
3. Prioritize items in `Suggested next actions` before new intake.

## Typical issue

- Counts look stale:
  - refresh browser page
  - confirm DB is reachable and app is running on expected environment

- Role or scope looks wrong:
  - sign out and sign in again to refresh session scope
  - if issue persists, ask `ORG_ADMIN` or `SUPER_ADMIN` to verify membership/default org

