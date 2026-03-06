# `/admin` Help

Last updated: 2026-03-06


## Purpose

Admin control tower for operations.
Use this page to monitor blockers, jump into QA research, and open audit/locking workflows.

## Key Areas

- Header quick actions
- KPI metrics
- Attention queue
- Grade distribution snapshot
- Recent references and recent submissions
- Top-nav admin sections:
  - Pre-launch profile (default): Overview, Briefs, Library, QA, Specs, Students
  - `SUPER_ADMIN`: adds Developer
  - Launch-mode profile (`NEXT_PUBLIC_UI_LAUNCH_MODE=true`): adds Users
  - Settings (cog icon on far-right)
- Advanced (direct URL only):
  - `/admin/reference`
  - `/admin/bindings`
  - `/admin/users` (still available by route when hidden in pre-launch nav)

## Recommended Flow

1. Check `Open blockers` and `Needs attention now`.
2. Resolve locking and extraction issues first.
3. Open `/admin/qa` for outcome analysis and report export.
4. Open `/admin/audit` to verify event-level evidence for any anomalies.

