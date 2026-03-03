# Environment Contract

Last updated: 2026-03-03

This is the canonical environment contract for deployment and runtime startup validation.

## Critical runtime requirements

1. `DATABASE_URL`
- Required in all environments.
- Used by Prisma and all DB-backed routes.

2. OpenAI credential (at least one should be set)
- `OPENAI_ADMIN_KEY` (preferred), or
- `OPENAI_ADMIN_API_KEY`, or
- `OPENAI_ADMIN`, or
- `OPENAI_API_KEY` (fallback)

Without one of these keys, grading and AI-assisted extraction/review routes will fail.

## Runtime startup validation behavior

Validation is centralized in `lib/runtimeEnvContract.ts` and invoked from:
- `app/layout.tsx`
- `lib/prisma.ts`

Behavior:
- Production runtime: fails hard on hard-fail requirements.
- Build/dev/test: logs warning only by default.

Overrides:
- Force strict mode in any environment: `ENV_CONTRACT_ENFORCE=true`
- Disable contract checks: `ENV_CONTRACT_DISABLE=true`
- Require OpenAI key as hard-fail in production runtime: `ENV_CONTRACT_REQUIRE_OPENAI=true`

Current hard-fail defaults:
- `DATABASE_URL`: hard-fail
- OpenAI credential: warning by default (hard-fail only when `ENV_CONTRACT_REQUIRE_OPENAI=true`)

## Canonical source of env keys

- Base template: `.env.example`
- OpenAI ops detail: `docs/operations/openai-settings.md`
- Hybrid/local overrides: `docs/operations/hybrid-ai-local-runbook.md`

## M9 auth scaffold env

- `AUTH_GUARDS_ENABLED`
  - default: `false`
  - effect: enables middleware role checks for `/admin/*` and `/api/admin/*`
  - rollout note: when enabled, signed-session login is required

- `AUTH_SESSION_SECRET`
  - required when `AUTH_GUARDS_ENABLED=true` and using signed session cookie bootstrap
  - minimum recommended length: 32+ characters

- `AUTH_LOGIN_USERNAME`
  - required when `AUTH_GUARDS_ENABLED=true`
  - username accepted by `/login`

- `AUTH_LOGIN_PASSWORD`
  - required when `AUTH_GUARDS_ENABLED=true`
  - password accepted by `/login` (set only in deployment secrets)

- `AUTH_LOGIN_ROLE`
  - optional when `AUTH_GUARDS_ENABLED=true`
  - issued session role (`ADMIN` default)

- `AUTH_BOOTSTRAP_ENABLED`
  - default: `false`
  - when `true`, enables legacy auto-bootstrap routes:
    - `POST /api/auth/session/bootstrap`
    - `POST /api/auth/role-sync`

## Storage migration env (M8)

- `FILE_STORAGE_ROOT`
  - optional
  - when set, provider-managed relative storage paths resolve under this root
  - scope: `uploads/*`, `reference_uploads/*`, `storage/*`, `submission_marked/*` when written via provider-aware paths
