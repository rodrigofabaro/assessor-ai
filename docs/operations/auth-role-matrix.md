# Auth + Role Matrix (M9 Foundation)

Last updated: 2026-03-03

This is the canonical role access matrix for phased auth rollout.

## Roles

1. `ADMIN`
- Full admin + API mutation rights.

2. `ASSESSOR`
- Operational grading/submission workflow rights (future enforcement phase).

3. `IV`
- Internal verification and audit review rights (future enforcement phase).

## Current scaffold (non-breaking)

Feature flag:
- `AUTH_GUARDS_ENABLED=false` (default)

When disabled:
- middleware does not block any route.
- current app behavior remains unchanged.

When enabled:
- middleware enforces role checks from:
  - request header `x-assessor-role` (preferred for early integration)
  - request header `x-active-role`
  - cookie `assessor_role`

## Route protection matrix (phase 1 scaffold)

1. `/admin/*`
- allowed roles: `ADMIN`

2. `/api/admin/*`
- allowed roles: `ADMIN`

3. all other routes
- no middleware role enforcement in this phase

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
