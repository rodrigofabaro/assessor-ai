# Deployment Environment Map

Last updated: 2026-03-04

## Purpose

Defines how local development, GitHub, Vercel deployments, and data stores work together.

## Environment model

1. Local (developer machine)
- Code source: local git working tree
- Runtime: `pnpm dev`
- Database: local/staging-safe DB only (never production DB)
- File storage: local folders (`uploads/`, `reference_uploads/`, `storage/*`)
- Goal: build and test changes before push

2. Preview (Vercel preview deployments)
- Trigger: push to non-`main` branch / PR
- Runtime: Vercel preview URL
- Database: separate preview/staging DB
- File storage: separate preview/staging object storage
- Goal: validate branch changes online before production

3. Production (Vercel production deployment)
- Trigger: push/merge to `main`
- Runtime: primary domain
- Database: production DB only
- File storage: production object storage only
- Goal: serve real users with stable, auditable behavior

## Git -> Vercel deployment flow

1. Create branch from latest `main`.
2. Implement and test locally.
3. Run pre-push gate: `pnpm run ops:prepush-prod`
4. Push branch to GitHub.
5. Vercel creates preview deployment automatically.
6. Validate preview behavior.
7. Merge to `main`.
8. Vercel deploys production automatically.
9. Run post-deploy smoke checks.

## Data ownership rules (critical)

1. Git stores code and docs only.
2. Git does not store live database records.
3. Git does not store uploaded/generated runtime files.
4. Each environment must have its own DB and file storage.
5. Never point preview/local to production DB.

Current hardening note (2026-03-04):
1. Environment variables in Vercel must be split by environment before scale-up.
2. Do not keep Preview/Development using Production DB credentials.

## Database policy

1. Local uses local DB connection in `.env`.
2. Preview uses Vercel preview env `DATABASE_URL`.
3. Production uses Vercel production env `DATABASE_URL`.
4. Schema changes are applied with `pnpm prisma migrate deploy` in target environment.
5. Backups are required before production migrations.

## Storage policy

1. Local filesystem is acceptable for local development.
2. Vercel deployments require persistent object storage integration for uploads and generated artifacts.
3. Preview and production storage must be separated (different buckets/prefixes/credentials).
4. During migration, provider-managed relative paths can be redirected with `FILE_STORAGE_ROOT`.
5. For durable Vercel storage, use `STORAGE_BACKEND=vercel_blob` with `BLOB_READ_WRITE_TOKEN`.

### If no storage env is configured yet

1. Local runtime writes default to repo folders (`uploads/`, `reference_uploads/`, `submission_marked/`, `storage/*`).
2. Vercel runtime currently falls back to writable temp storage (`/tmp/assessor-ai`), which is non-durable.
3. Recommended immediate local setting:
- Set `FILE_STORAGE_ROOT=.local-storage` in local `.env` to keep generated files isolated from repo fixtures.
4. Recommended production setting:
- Keep Vercel on DB-only validation until durable object storage credentials are configured.

Current hardening note (2026-03-04):
1. Existing provider still resolves to filesystem paths; production-safe durable object storage backend remains required.
2. Temporary runtime mitigation may use Vercel writable temp storage (`/tmp`) for operational continuity, but this is non-durable and not an end-state.
3. Operator-confirmed (2026-03-04): production storage target locations are not configured yet.
4. Deployment gate impact: production deploy-smoke currently fails at upload submission-create path until storage target + schema alignment are finalized.

Current update (2026-03-05):
1. `STORAGE_BACKEND=vercel_blob` is now supported for runtime upload/read/write paths.
2. Keep `BLOB_READ_WRITE_TOKEN` set in preview/production Vercel environments before enabling `vercel_blob`.

Current update (2026-03-11):
1. Submission automation runner scheduling uses `GET /api/cron/submission-automation`.
2. Native Vercel cron is configured as a daily safety net so Hobby deployments remain deployable.
3. Higher-frequency processing requires an external scheduler using `SUBMISSION_AUTOMATION_CRON_SECRET`, or a Vercel Pro cron setup.

## Required Vercel env groups

Set these separately for Preview and Production:

1. `DATABASE_URL`
2. `AUTH_SESSION_SECRET`
3. OpenAI keys used by runtime profile (`OPENAI_API_KEY` and related keys if enabled)
4. Other provider keys in use (for example Turnitin, if enabled)

## Release safety checks

Before merge to `main`:

1. `pnpm run ops:prepush-prod` (git policy + prisma generate + tsc + build + regression pack + export pack validation)
2. Preview deployment checks pass

Before production cutover:

1. `pnpm run ops:release-gate`

After production deploy:

1. `pnpm run ops:deploy-smoke`
2. Confirm critical user routes and export paths
3. Record evidence artifacts under `docs/evidence/`

## Rollback model

1. Revert/fix in Git and push.
2. Vercel redeploys from updated `main`.
3. If needed, restore DB/files from backups per `docs/operations/storage-migration-rollback.md`.
