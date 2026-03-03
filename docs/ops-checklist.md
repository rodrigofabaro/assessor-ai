# Ops Checklist (Reproducible)

Last updated: 2026-03-03

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
3. `pnpm run test:export-pack-validation`
4. `pnpm run ops:deploy-smoke`

Output:
- Writes `docs/evidence/release-gate/YYYYMMDD-HHMMSS.json`
- Fails fast and exits non-zero on first failing step

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

## Build Reproducibility Check

```powershell
pnpm exec tsc --noEmit
pnpm run build
pnpm run test:export-pack-validation
```
