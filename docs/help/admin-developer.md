# `/admin/developer` Help

Last updated: 2026-03-05

## Purpose

Super-admin control plane for platform-level operations:

1. organization lifecycle
2. per-organization configuration JSON
3. encrypted per-organization integration secrets

This route is restricted to `SUPER_ADMIN`.

## Main actions

1. Create organizations with optional slug.
2. Rename, activate/deactivate, or delete organizations.
3. Select organization scope and edit config JSON.
4. Rotate/update OpenAI, Turnitin, and SMTP API secrets.

## Important behavior

1. Secret values are write-only in UI and encrypted at rest.
2. Default super-admin scope is `assessor-ai` organization.
3. User provisioning remains in `/admin/users`; platform configuration remains in `/admin/settings`.

