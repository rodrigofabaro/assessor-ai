# Deployment Environment Map

Last updated: 2026-03-03

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
