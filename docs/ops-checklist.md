# Ops Checklist (Reproducible)

Last updated: 2026-03-05

Roadmap status:
- Operations execution runbook (not canonical roadmap).
- Canonical roadmap is `docs/Milestones.md`.
- Index: `docs/ROADMAP.md`.
- Documentation rules: `docs/DOCS_SYSTEM.md`.

## Preconditions

1. PostgreSQL is running and reachable by `DATABASE_URL`.
2. PowerShell 7+, Node.js 20+, and pnpm are installed.
3. Environment contract reviewed: `docs/operations/environment-contract.md`.
4. Storage migration/rollback runbook reviewed: `docs/operations/storage-migration-rollback.md`.
5. If using external storage mount during migration, `FILE_STORAGE_ROOT` is set for target runtime.

## Fresh Clone To Running App

```powershell
git clone https://github.com/rodrigofabaro/assessor-ai.git
cd assessor-ai/webapp
Copy-Item .env.example .env
pnpm install
pnpm prisma generate
pnpm prisma migrate deploy
node prisma/seed.cjs
pnpm run ops:bootstrap-grade-baseline
pnpm dev
```

## Upload -> Extract -> Grade -> Export (Exact Commands)

Run these in a second terminal while `pnpm dev` is running:

```powershell
$Base = "http://localhost:3000"

# Build a local sample PDF (deterministic, no external files needed)
node -e "const { PDFDocument } = require('pdf-lib'); (async () => { const d = await PDFDocument.create(); const p = d.addPage([595,842]); p.drawText('Ops checklist sample submission'); const b = await d.save(); require('fs').writeFileSync('tmp-ops-sample.pdf', b); })();"
$SampleFile = (Resolve-Path ".\tmp-ops-sample.pdf").Path

# 1) Upload sample submission
$upload = Invoke-RestMethod -Method Post -Uri "$Base/api/submissions/upload" -Form @{
  files = Get-Item $SampleFile
}
$submissionId = $upload.submissions[0].id

# 2) Force extraction run
Invoke-RestMethod -Method Post -Uri "$Base/api/submissions/$submissionId/extract?force=1" | Out-Null

# 3) Link seeded student (TS001)
$studentId = (Invoke-RestMethod -Method Get -Uri "$Base/api/students?query=TS001" | Select-Object -First 1).id
Invoke-RestMethod -Method Post -Uri "$Base/api/submissions/$submissionId/link-student" -ContentType "application/json" -Body (@{
  studentId = $studentId
} | ConvertTo-Json) | Out-Null

# 4) Link seeded assignment (4017 A1)
$assignmentId = ((Invoke-RestMethod -Method Get -Uri "$Base/api/assignments") | Where-Object {
  $_.unitCode -eq "4017" -and $_.assignmentRef -eq "A1"
} | Select-Object -First 1).id
Invoke-RestMethod -Method Patch -Uri "$Base/api/submissions/$submissionId" -ContentType "application/json" -Body (@{
  assignmentId = $assignmentId
} | ConvertTo-Json) | Out-Null

# 5) Grade
$grade = Invoke-RestMethod -Method Post -Uri "$Base/api/submissions/$submissionId/grade" -ContentType "application/json" -Body "{}"
$grade.assessment.overallGrade

# 6) Export marked PDF
$outFile = ".\tmp-marked-$submissionId.pdf"
Invoke-WebRequest -Method Get -Uri "$Base/api/submissions/$submissionId/marked-file" -OutFile $outFile
Resolve-Path $outFile

# 7) Generate deterministic export pack
$pack = Invoke-RestMethod -Method Post -Uri "$Base/api/submissions/$submissionId/export" -ContentType "application/json" -Body "{}"
$exportId = $pack.pack.exportId
$exportId

# 8) Replay parity check against same export id
$replay = Invoke-RestMethod -Method Post -Uri "$Base/api/submissions/$submissionId/export/replay" -ContentType "application/json" -Body (@{
  exportId = $exportId
} | ConvertTo-Json)
$replay.replay.hashMatch
$replay.replay.assessmentHashMatch

# 9) Capture versioned evidence artifact (requires app running)
pnpm run ops:export-pack-evidence
# Optional: verify candidate selection only (no API calls)
node scripts/export-pack-evidence.js --dry-run
```

## Automated Deploy Smoke (Single Command)

Use this for deployment gate evidence (app must be running):

```powershell
pnpm run ops:deploy-smoke
```

Output:
- Writes `docs/evidence/deploy-smoke/YYYYMMDD-HHMMSS.json`
- Exits non-zero on failure
- Failure artifact includes step, status, and API error payload for triage

## Release Gate (Required Before Deploy)

Run one command:

```powershell
pnpm run ops:release-gate
```

What it runs:
1. `pnpm exec tsc --noEmit --incremental false`
2. `pnpm run test:regression-pack`
3. `pnpm run ops:feedback-quality-contract`
4. `pnpm run test:export-pack-validation`
5. `pnpm run ops:storage-contract`
6. `pnpm run ops:schema-contract`
7. `pnpm run ops:password-recovery-contract`
8. `pnpm run ops:email-webhook-contract`
9. `pnpm run ops:openai-responses-contract`
10. `pnpm run ops:readiness-contract`
11. `pnpm run ops:email-webhook-smoke`
12. `pnpm run ops:deploy-smoke`

Storage deployment contract behavior:
- If `STORAGE_BACKEND=filesystem` and `FILE_STORAGE_ROOT` is unset, command warns and passes by default.
- If `STORAGE_BACKEND=vercel_blob`, command requires `BLOB_READ_WRITE_TOKEN`.
- Set `ENV_CONTRACT_REQUIRE_STORAGE_ROOT=true` in deploy/cutover environments to hard-fail when durable filesystem storage root is not configured.

Schema contract behavior:
- Verifies key migration objects and columns exist (for org scope + auth/email ops tables).
- If schema drift is detected (missing tables/columns), command fails.
- Set `AUTH_REQUIRE_SCHEMA_CONTRACT=true` in deploy/cutover environments to hard-fail when DB connection is unavailable.

Password recovery contract behavior:
- If `AUTH_INVITE_EMAIL_PROVIDER=none`, command warns and passes by default.
- Set `AUTH_REQUIRE_RECOVERY_EMAIL=true` in deploy/cutover environments to hard-fail when recovery email provider is not configured.

Email webhook contract behavior:
- If `AUTH_INVITE_EMAIL_PROVIDER=none`, command warns and passes by default.
- If using Resend and `RESEND_WEBHOOK_SECRET` is unset, command warns and passes by default.
- Set `AUTH_REQUIRE_EMAIL_WEBHOOK=true` to hard-fail unless signed webhook config is present and unsigned mode is disabled.

OpenAI responses contract behavior:
- Verifies live `/v1/responses` write call capability (scope `api.responses.write`) when enabled.
- If no key or probe disabled, command warns and passes by default.
- Set `AUTH_REQUIRE_OPENAI_RESPONSES_WRITE=true` in deploy/cutover environments to hard-fail on missing scope.

Feedback quality contract behavior:
- Verifies grading pipeline still enforces VASCR + annotation realism policy wiring.
- Verifies regression pack retains feedback policy tests.

Email webhook smoke behavior:
- Sends a signed synthetic lifecycle event to `POST /api/webhooks/resend` and writes evidence.
- Base URL resolution: `EMAIL_WEBHOOK_SMOKE_BASE_URL` -> `READINESS_BASE_URL` -> `DEPLOY_SMOKE_BASE_URL` -> `http://localhost:3000`.
- If provider is not `resend` or webhook secret is missing, command skips unless strict mode is enabled.

Readiness contract behavior:
- Calls `/api/health/readiness` and fails when required dependencies are not ready.
- Base URL is resolved from `READINESS_BASE_URL`, then `DEPLOY_SMOKE_BASE_URL`, then `http://localhost:3000`.

Output:
- Writes `docs/evidence/release-gate/YYYYMMDD-HHMMSS.json`
- Fails fast and exits non-zero on first failing step

## Production Cutover Assistant (One Command)

For a guided production cutover flow (env sync -> migrate -> deploy -> smoke -> release gate):

```powershell
pnpm run ops:cutover-prod
```

What it does:
1. Prompts for required production secrets/settings (Resend, Blob, DB URL, smoke creds)
2. Syncs Vercel production envs (`AUTH_*`, `CONTACT_*`, `ALERT_*`, `STORAGE_*`)
3. Runs `pnpm prisma migrate deploy` against provided production `DATABASE_URL`
4. Runs `vercel --prod`
5. Runs `pnpm run ops:deploy-smoke`
6. Runs `pnpm run ops:release-gate`

Vercel production build behavior:
- `pnpm run build:vercel` now runs `pnpm prisma migrate deploy` automatically in Production when `DATABASE_URL` is present.
- Keep explicit cutover migration in place anyway; build-time migration is a safety net, not a replacement for controlled cutover.
- Use `PRISMA_SKIP_MIGRATE_ON_BUILD=true` only as an emergency override.

Output:
- Writes `docs/evidence/cutover-prod/YYYYMMDD-HHMMSS.json`
- Fails on first failed step with evidence reference

Optional skip switches:
- `-SkipEnvSync`
- `-SkipMigrate`
- `-SkipDeploy`
- `-SkipSmoke`
- `-SkipReleaseGate`

## Pre-Push Production Checklist (Before merge to `main`)

Run one command:

```powershell
pnpm run ops:prepush-prod
```

What it enforces:
1. Git branch policy (`main` blocked by default)
2. Clean working tree (blocked if dirty by default)
3. `pnpm prisma generate`
4. `pnpm exec tsc --noEmit --incremental false`
5. `pnpm run build`
6. `pnpm run test:regression-pack`
7. `pnpm run test:export-pack-validation`

Output:
- Writes `docs/evidence/prepush-prod/YYYYMMDD-HHMMSS.json`
- Exits non-zero on first failing policy/check

Overrides (only when intentional):
- `pnpm run ops:prepush-prod -- -AllowDirty`
- `pnpm run ops:prepush-prod -- -AllowMain`

## Auth Guard Smoke (Staging Only)

Run this only when auth guards are enabled in the target runtime:

```powershell
pnpm run ops:auth-guard-smoke
```

Requirements:
1. `AUTH_GUARDS_ENABLED=true`
2. `AUTH_SESSION_SECRET` configured

Output:
- Writes `docs/evidence/auth-guard-smoke/YYYYMMDD-HHMMSS.json`
- Verifies 401/403/allow behavior and session-cookie bootstrap path

## Alert Channel Smoke (Staging/Production)

Use this to validate operational alert routing (`ALERT_EMAIL_TO`):

```powershell
pnpm run ops:alert-smoke
```

Dry-run mode (no email sent):

```powershell
pnpm run ops:alert-smoke -- --dry-run
```

Output:
- Writes `docs/evidence/ops-alert-smoke/YYYYMMDD-HHMMSS.json`
- Sends one email through Resend when provider/sender/recipient are configured
- If alert channel is optional and not configured, command exits pass with `skipped` status
- Set `AUTH_REQUIRE_ALERT_EMAIL=true` to fail when alert channel is not configured

## Build Reproducibility Check

```powershell
pnpm exec tsc --noEmit
pnpm run build
pnpm run test:export-pack-validation
```
