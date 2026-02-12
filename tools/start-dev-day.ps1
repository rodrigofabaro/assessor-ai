param(
  [string]$Repo = "C:\Users\rodri\Website\assessor-ai\webapp"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

if (-not (Test-Path $Repo)) {
  Write-Host "Repo path not found: $Repo" -ForegroundColor Red
  exit 1
}

# Prefer Windows Terminal (two tabs)
if (Test-Command "wt") {
  $wtArgs = @(
    "new-tab", "-d", $Repo, "pwsh", "-NoExit", "-Command", "pnpm dev",
    ";",
    "new-tab", "-d", $Repo, "pwsh", "-NoExit", "-Command", "codex"
  )

  Start-Process wt -ArgumentList $wtArgs
  exit 0
}

# Fallback: two separate PowerShell windows
Start-Process pwsh -WorkingDirectory $Repo -ArgumentList @("-NoExit", "-Command", "pnpm dev")
Start-Process pwsh -WorkingDirectory $Repo -ArgumentList @("-NoExit", "-Command", "codex")
