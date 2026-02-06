$ErrorActionPreference = "Stop"

function Require-EnvVar {
  param ([string]$Name)
  if (-not $env:$Name) {
    Write-Error "Missing required environment variable: $Name"
    exit 1
  }
}

Require-EnvVar "DATABASE_URL"

Write-Host "Starting Assessor AI dev server..."
Write-Host "App URL: http://localhost:3000"
Write-Host "Stop with Ctrl+C."

npm run dev
