$ErrorActionPreference = "Stop"

function Require-EnvVar {
  param ([string]$Name)
  if (-not $env:$Name) {
    Write-Error "Missing required environment variable: $Name"
    exit 1
  }
}

Require-EnvVar "DATABASE_URL"

Write-Host "Resetting database (migrate reset + seed)..."

npx prisma migrate reset --force --skip-seed
npx prisma db seed

Write-Host "Reset complete. You can now run scripts/dev.ps1."
