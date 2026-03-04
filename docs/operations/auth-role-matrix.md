# Auth + Role Matrix (M9 Foundation)

Last updated: 2026-03-04

This is the canonical role access matrix for phased auth rollout.

## Roles

0. `SUPER_ADMIN` (platform role)
- Platform-wide control across all organizations, users, and organization configuration.

1. `ADMIN`
- Full admin + API mutation rights.
- Transitional app role; target org-level equivalent is `ORG_ADMIN`.

2. `ASSESSOR`
- Operational grading/submission workflow rights (future enforcement phase).

3. `IV`
- Internal verification and audit review rights (future enforcement phase).

4. `ORG_ADMIN` (organization membership role, M10 target)
- Admin rights limited to one organization scope.
- Can manage users/settings in that organization only.

## Current scaffold (non-breaking)

Feature flag:
- `AUTH_GUARDS_ENABLED=false` (default)

When disabled:
- middleware does not block any route.
- current app behavior remains unchanged.

When enabled:
- middleware enforces role checks from:
  - signed session cookie `assessor_session` (preferred source)
  - cookie `assessor_role` (legacy fallback)
  - request header `x-assessor-role` (temporary fallback only)
  - request header `x-active-role` (temporary fallback only)

Cookie bridge endpoint:
- `POST /api/auth/role-sync`
- sets `assessor_role` from active audit user role in app config
- mounted in layout via `AuthRoleSync` when `AUTH_GUARDS_ENABLED=true`

Session bootstrap endpoint:
- `POST /api/auth/session/bootstrap`
- issues signed `assessor_session` cookie from active audit user role
- requires `AUTH_SESSION_SECRET` (minimum 24 chars)
- called by `AuthRoleSync` first; falls back to role-sync bridge if unavailable

## Route protection matrix (phase 1 scaffold)

1. `/admin/*`
- allowed roles: `ADMIN`

2. `/api/admin/*`
- allowed roles: `ADMIN`

3. all other routes
- no middleware role enforcement in this phase

4. `/submissions/*`, `/students/*`, `/api/submissions/*`, `/api/students/*`
- allowed roles: `ADMIN`, `ASSESSOR`, `IV`

## Enforcement responses

1. API routes (`/api/*`)
- missing role: `401` with `AUTH_REQUIRED`
- disallowed role: `403` with `ROLE_FORBIDDEN`

2. page routes
- missing role: redirect to `/?auth=required`
- disallowed role: redirect to `/?auth=forbidden`

## Rollout plan (safe order)

1. Keep `AUTH_GUARDS_ENABLED=false` in all environments while integrating identity source.
2. Enable in staging with request-header role injection.
3. Validate all admin workflows and API calls.
4. Move from header-based role to real session/cookie-backed role.
5. Expand matrix to non-admin routes (`/submissions`, `/students`, `/api/submissions/*`) after role contracts are finalized.
6. M10: move from single `AppUser.organizationId` to membership-based org context and add active-org switch route.
7. M10: enforce `SUPER_ADMIN` vs `ORG_ADMIN` boundaries in admin APIs.

## Staging validation command

Use this only when `AUTH_GUARDS_ENABLED=true` in the running environment:

```powershell
pnpm run ops:auth-guard-smoke
```

Behavior:
- validates 401/403/allowed guard behavior for admin and submissions/students APIs
- validates session bootstrap cookie path (`/api/auth/session/bootstrap`)
- writes evidence to `docs/evidence/auth-guard-smoke/*.json`

Note:
- This command is intentionally not part of default `ops:release-gate` until auth enforcement is enabled for deployment environments.
