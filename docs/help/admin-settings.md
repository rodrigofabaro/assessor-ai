# `/admin/settings` Help

Last updated: 2026-03-11

## Purpose

Configure platform behavior in four scoped sections:

1. `AI`: model + connectivity
2. `Grading`: tone/strictness/template/page-notes
3. `App`: audit actor, automation policy, branding, and Turnitin
4. `Organization`: active-tenant JSON config and encrypted integration secrets

This page is the policy control surface for operations and QA.

Super-admin-only controls for organization lifecycle remain in:

- `/admin/developer`

## Section map

1. AI
- OpenAI connection state and usage diagnostics
- active model selection
- AI smoke test before save

2. Grading
- tone, strictness, rubric behavior
- feedback template controls
- page-notes controls (enable, tone, limits, criterion code)
- grading config smoke test before save

3. App
- active audit user (assessor attribution source)
- automation policy toggles
- Turnitin configuration and smoke test
- favicon upload (storage-backed, served via `/api/favicon`)

4. Organization
- edits the current active organization from session scope
- supports switching active organization in-page before loading tenant settings
- stores audited JSON config per tenant
- stores encrypted secret identifiers per tenant (`OPENAI_API_KEY`, `TURNITIN_API_KEY`, `SMTP_API_KEY`)
- uses the same underlying org-settings API as the developer console, but in the normal org-admin settings flow

## Turnitin workflow in Settings

Use the App section card `Turnitin (QA)`:

1. Set/verify:
- integration enabled
- QA-only restriction (recommended outside production-wide rollout)
- auto-send on extraction (optional)
- auto-refresh AI writing score after grading (optional)
- base URL, owner user id, viewer user id, locale
- integration name/version
- API key

2. Run `Test Turnitin`.
3. Save Turnitin config.

Notes:
- `Open report` links are short-lived tokens and are generated fresh from QA row action.
- AI-writing percentage can remain `0%` when the tenant/product does not expose AI-writing detection metadata.

## Save strategy

Use this order for high-safety changes:

1. Draft section changes.
2. Run section smoke test(s).
3. Use `Save all atomically` when multiple sections changed.
4. Verify settings audit trail entry and from/to diffs.

## Important behavior

- Unsaved-change guard prevents accidental navigation loss.
- `Revert` restores last loaded values.
- `Reset defaults` applies baseline defaults for that section.
- Saved values are auditable through settings audit events.
- Write access is based on signed-in session role (`ADMIN` or `SUPER_ADMIN`), while `active audit user` is attribution context for audit logs.
- `Organization` settings are scoped to the active organization in session. Switch org first if you need to edit a different tenant.
