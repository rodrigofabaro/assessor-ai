# Environment Contract

Last updated: 2026-03-06

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
- Require explicit durable storage root in deploy/cutover checks: `ENV_CONTRACT_REQUIRE_STORAGE_ROOT=true`

Current hard-fail defaults:
- `DATABASE_URL`: hard-fail
- OpenAI credential: warning by default (hard-fail only when `ENV_CONTRACT_REQUIRE_OPENAI=true`)

## Canonical source of env keys

- Base template: `.env.example`
- OpenAI ops detail: `docs/operations/openai-settings.md`
- Hybrid/local overrides: `docs/operations/hybrid-ai-local-runbook.md`

## M9 auth scaffold env

Primary login mode:
- DB-backed user credentials managed in `Admin → Users` (email + password hash stored in `AppUser`).
- Optional invite-email sending for generated credentials is available from `Admin → Users`.

- `AUTH_GUARDS_ENABLED`
  - default: `false` in local/dev; `true` by default in production when unset
  - effect: enables middleware role checks for `/admin/*` and `/api/admin/*`
  - rollout note: when enabled, signed-session login is required for all non-public routes

- `AUTH_ORG_SCOPE_STRICT_READS`
  - default: `false`
  - when `false`, org-scoped reads allow compatibility fallback rows where `organizationId` is null
  - when `true`, org-scoped reads enforce active-organization-only visibility (`organizationId=<activeOrgId>`) for tenant APIs using `addOrganizationReadScope`
  - when `true`, request-session hydration also revalidates the signed session `orgId` against current memberships so stale switched-org cookies cannot keep an invalid tenant scope
  - migration intent: keep `false` during mixed legacy/membership rollout, then set `true` when tenant data is fully scoped

- `AUTH_SESSION_SECRET`
  - required when `AUTH_GUARDS_ENABLED=true` and using signed session cookie bootstrap
  - minimum recommended length: 32+ characters

- `AUTH_LOGIN_USERNAME`
  - optional fallback when `AUTH_GUARDS_ENABLED=true`
  - username accepted by `/login` only when using env fallback login

- `AUTH_LOGIN_PASSWORD`
  - optional fallback when `AUTH_GUARDS_ENABLED=true`
  - password accepted by `/login` only when using env fallback login

- `AUTH_LOGIN_ROLE`
  - optional with env fallback login
  - issued session role for env fallback (`ADMIN` default)

- `AUTH_BOOTSTRAP_ENABLED`
  - default: `false`
  - when `true`, enables legacy auto-bootstrap routes:
    - `POST /api/auth/session/bootstrap`
    - `POST /api/auth/role-sync`

- `AUTH_INVITE_EMAIL_PROVIDER`
  - default: `none`
  - options: `none`, `resend`
  - controls server-side invite email sending for generated credentials and password recovery delivery (`POST /api/auth/password-recovery`)

- `AUTH_APP_ORIGIN`
  - required when password recovery email delivery is enabled (`AUTH_INVITE_EMAIL_PROVIDER=resend` or `AUTH_REQUIRE_RECOVERY_EMAIL=true`)
  - used to build absolute password recovery links in email (`/auth/reset?rid=...&t=...`)

- `RESET_TOKEN_PEPPER`
  - required when password recovery email delivery is enabled (`AUTH_INVITE_EMAIL_PROVIDER=resend` or `AUTH_REQUIRE_RECOVERY_EMAIL=true`)
  - HMAC secret used to hash one-time recovery tokens before DB storage

- `AUTH_PASSWORD_RECOVERY_TTL_MINUTES`
  - default: `15`
  - accepted range: `5..60`
  - controls recovery-link expiry window

- `AUTH_REQUIRE_RECOVERY_EMAIL`
  - default: `false`
  - when `true`, release gate requires active email provider configuration for password-recovery delivery

- `AUTH_INVITE_EMAIL_DEFAULT_ON`
  - default: `false`
  - when `true`, new-user form defaults to sending invite email

- `RESEND_API_KEY`
  - required when `AUTH_INVITE_EMAIL_PROVIDER=resend`
  - API key for Resend

- `AUTH_EMAIL_FROM`
  - required when `AUTH_INVITE_EMAIL_PROVIDER=resend`
  - verified sender email address in Resend (e.g. `Assessor AI <no-reply@assessor-ai.co.uk>`)

- `RESEND_WEBHOOK_SECRET`
  - recommended when `AUTH_INVITE_EMAIL_PROVIDER=resend`
  - Svix signing secret used to verify Resend webhook signatures
  - enables lifecycle telemetry ingestion route: `POST /api/webhooks/resend`

- `RESEND_WEBHOOK_ALLOW_UNSIGNED`
  - default: `false`
  - local/dev fallback to accept unsigned webhook payloads when signature secret is not set
  - do not enable in production

- `AUTH_REQUIRE_EMAIL_WEBHOOK`
  - default: `false`
  - when `true`, release gate requires signed webhook config (`RESEND_WEBHOOK_SECRET`) and rejects unsigned mode
  - validated by `pnpm run ops:email-webhook-contract`
  - readiness endpoint also treats webhook config as required when enabled (`checks.emailWebhook`)

- `AUTH_REQUIRE_SCHEMA_CONTRACT`
  - default: `false`
  - when `true`, release gate requires DB schema contract checks to pass (`pnpm run ops:schema-contract`)
  - validates presence of core migration objects used by organization scope and email operations
  - readiness endpoint also treats schema as required when enabled (`checks.schema`)

- `AUTH_REQUIRE_OPENAI_RESPONSES_WRITE`
  - default: `false`
  - when `true`, release gate requires live OpenAI Responses API write probe to pass (`pnpm run ops:openai-responses-contract`)
  - readiness endpoint treats responses-write check as required when enabled (`checks.openaiResponsesWrite`)

- `OPENAI_RESPONSES_WRITE_PROBE_ENABLED`
  - default: `false`
  - enables live Responses API write probe in non-strict mode
  - used by `pnpm run ops:openai-responses-contract`

- `OPENAI_RESPONSES_CONTRACT_MODEL`
  - optional
  - model override for Responses API contract probe; falls back to `OPENAI_MODEL` or `gpt-4.1-mini`

- `CONTACT_EMAIL_FROM`
  - optional
  - overrides contact-form sender identity; falls back to `AUTH_EMAIL_FROM` when unset

- `CONTACT_FORM_TO`
  - optional
  - recipient mailbox for landing-page contact form (`POST /api/public/contact`)
  - default fallback when unset: `contact@assessor-ai.co.uk`

- `ALERT_EMAIL_FROM`
  - optional
  - overrides alert sender identity; falls back to `AUTH_EMAIL_FROM` when unset

- `ALERT_EMAIL_TO`
  - optional
  - recipient mailbox for critical runtime alert emails (upload/blob finalize failures)
  - when unset, alert dispatch is disabled

- `AUTH_REQUIRE_ALERT_EMAIL`
  - default: `false`
  - when `true`, alert smoke validation must not skip due to missing provider/sender/recipient config
  - used with `pnpm run ops:alert-smoke`

## Pre-launch UI profile env (Queue F)

- `NEXT_PUBLIC_UI_LAUNCH_MODE`
  - default: `false`
  - when `true`, launch-mode tenant controls are progressively surfaced in primary admin navigation (for example `/admin/users`)
  - when `false`, navigation stays in simplified pre-launch profile while existing routes/APIs remain available

## Storage migration env (M8)

- `STORAGE_BACKEND`
  - default: `filesystem`
  - options: `filesystem`, `vercel_blob`
  - selects runtime storage provider for uploads/generated artifacts

- `BLOB_READ_WRITE_TOKEN`
  - required when `STORAGE_BACKEND=vercel_blob`
  - Vercel Blob read/write token used for server-side upload/read/delete

- `ENV_CONTRACT_REQUIRE_STORAGE_ROOT`
  - default: `false`
  - when `true`, deployment gate requires `FILE_STORAGE_ROOT` to be an absolute non-temp path when `STORAGE_BACKEND=filesystem`
  - intended for preview/production cutover checks to block implicit local/tmp storage fallback

- `FILE_STORAGE_ROOT`
  - optional
  - when set, provider-managed relative storage paths resolve under this root
  - scope: `uploads/*`, `reference_uploads/*`, `storage/*`, `submission_marked/*` when written via provider-aware paths

## Runtime readiness probe env (M8)

- `READINESS_BASE_URL`
  - optional
  - base URL used by `pnpm run ops:readiness-contract`
  - fallback chain: `READINESS_BASE_URL` -> `DEPLOY_SMOKE_BASE_URL` -> `http://localhost:3000`

- `HEALTH_READINESS_PROBE_OPENAI`
  - default: `false`
  - when `true`, `/api/health/readiness` actively probes OpenAI connectivity (`/v1/models`) instead of key-presence-only checks

- `HEALTH_READINESS_PROBE_OPENAI_RESPONSES_WRITE`
  - default: `false`
  - when `true`, `/api/health/readiness` performs a minimal live write probe against `/v1/responses`
  - auto-enabled when `AUTH_REQUIRE_OPENAI_RESPONSES_WRITE=true`

- `AUTH_ANOMALY_ALERT_COOLDOWN_MINUTES`
  - default: `30`
  - cooldown window for repeated auth anomaly alert emails (per anomaly kind/actor/route key)

- `EMAIL_WEBHOOK_SMOKE_BASE_URL`
  - optional
  - base URL used by `pnpm run ops:email-webhook-smoke`
  - fallback chain: `EMAIL_WEBHOOK_SMOKE_BASE_URL` -> `READINESS_BASE_URL` -> `DEPLOY_SMOKE_BASE_URL` -> `http://localhost:3000`
