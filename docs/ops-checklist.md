# Ops Checklist (Reproducible)

Last updated: 2026-02-20

## Preconditions

1. PostgreSQL is running and reachable by `DATABASE_URL`.
2. PowerShell 7+, Node.js 20+, and pnpm are installed.

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
$SampleFile = (Resolve-Path ".\tmp-brief-target.pdf").Path

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
```

## Build Reproducibility Check

```powershell
pnpm exec tsc --noEmit
pnpm run build
```
