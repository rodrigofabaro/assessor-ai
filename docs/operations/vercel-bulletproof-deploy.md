# Vercel Bulletproof Deploy Runbook

Last updated: 2026-03-04

## Goal

Avoid deploying wrong commits, missing migrations, or broken runtime config.

## 0) Precondition

1. Vercel project root directory is `webapp`.
2. Production branch is `main`.

## 1) Pre-push gate (local)

Run:

```powershell
pnpm run ops:prepush-prod
```

Must pass before pushing.

## 2) Push exact commit

1. Confirm local head:

```powershell
git rev-parse --short HEAD
```

2. Push:

```powershell
git push origin main
```

3. Confirm remote head matches local:

```powershell
git ls-remote --heads origin main
```

## 3) Verify Vercel is building the right commit

In Vercel deployment details, confirm Git commit hash equals remote `main` hash.

If hash mismatch:
1. Stop.
2. Redeploy latest `main` commit explicitly.

## 4) Required env in Vercel (Production)

1. `DATABASE_URL`
2. `AUTH_SESSION_SECRET`
3. OpenAI keys in use (`OPENAI_API_KEY` / admin keys) with Responses API write scope (`api.responses.write`)
4. Turnitin keys (if enabled)

Environment isolation rule:
1. Production DB/storage credentials must exist only in Production env scope.
2. Preview and Development must use separate DB/storage credentials.

## 5) Run DB migrations for target DB

Preferred (automatic):
1. In Vercel Project Settings -> Build & Development Settings -> Build Command, set:

```powershell
pnpm run build:vercel
```

2. This runs `prisma migrate deploy` automatically in Production builds (`VERCEL_ENV=production`).

Manual fallback:

```powershell
pnpm prisma migrate deploy
pnpm prisma generate --no-engine
```

## 6) Post-deploy verification

Run smoke against deployed URL:

```powershell
$env:DEPLOY_SMOKE_BASE_URL="https://your-domain.com"
$env:DEPLOY_SMOKE_USERNAME="your-login-user"
$env:DEPLOY_SMOKE_PASSWORD="your-login-password"
pnpm run ops:deploy-smoke
```

Verify evidence artifact in `docs/evidence/deploy-smoke/`.

Also confirm:
1. Runtime file writes are backed by durable object storage (not local ephemeral filesystem).
2. Deployment release notes link to the smoke evidence artifact.
3. Baseline grading data exists (at least one assignment available via `/api/assignments`) so full smoke can reach grade/export/replay stages.

## 7) If deploy fails

1. Check failing commit hash in Vercel.
2. Compare with `origin/main`.
3. If mismatch, redeploy correct commit.
4. If match, fix code on local -> run pre-push gate -> push -> redeploy.
5. If smoke fails with `GRADE_FAILED` and OpenAI permission message, rotate to a key with `api.responses.write` and redeploy.
