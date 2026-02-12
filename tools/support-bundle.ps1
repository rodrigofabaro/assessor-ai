param(
  [string]$Repo = (Get-Location).Path,
  [string]$Out = "tools\support_bundle.txt"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$sep = "`r`n" + ("=" * 80) + "`r`n"

$lines = @()
$lines += "DATE: $(Get-Date -Format s)"
$lines += "REPO: $Repo"
$lines += $sep

Push-Location $Repo

$lines += "## GIT"
$lines += (git status)
$lines += ""
$lines += (git log -1 --oneline)
$lines += ""
$lines += (git branch -vv)
$lines += $sep

$lines += "## VERSIONS"
$lines += ("node: " + (node -v 2>&1))
$lines += ("pnpm: " + (pnpm -v 2>&1))
$lines += $sep

$lines += "## LINT"
$lines += (pnpm lint 2>&1)
$lines += $sep

$lines += "## TEST"
$lines += (pnpm test 2>&1)
$lines += $sep

Pop-Location

New-Item -ItemType Directory -Force -Path (Split-Path $Out) | Out-Null
$lines -join "`r`n" | Set-Content -Encoding UTF8 $Out

Write-Host "Wrote: $Out" -ForegroundColor Cyan
Write-Host "Open it and paste the contents into ChatGPT when needed." -ForegroundColor DarkGray
