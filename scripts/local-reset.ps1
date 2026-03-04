$ErrorActionPreference = "Stop"

Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

function Get-EnvValue {
  param(
    [string]$Name
  )
  if (-not (Test-Path ".env")) {
    return $null
  }
  $line = Get-Content ".env" | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }
  $value = ($line -split "=", 2)[1].Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Get-DatabaseUrl {
  $candidate = [string]$env:DATABASE_URL
  if ([string]::IsNullOrWhiteSpace($candidate)) {
    $candidate = [string](Get-EnvValue -Name "DATABASE_URL")
  }
  return $candidate.Trim()
}

function Assert-LocalDatabase {
  param(
    [string]$DatabaseUrl
  )
  if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    throw "DATABASE_URL is missing. Refusing reset."
  }
  $uri = [System.Uri]$DatabaseUrl
  $allowedHosts = @("localhost", "127.0.0.1", "::1")
  if ($allowedHosts -notcontains $uri.Host.ToLowerInvariant()) {
    throw "Refusing reset: DATABASE_URL host '$($uri.Host)' is not local."
  }
  Write-Output "Local DB target confirmed: $($uri.Host):$($uri.Port)$($uri.AbsolutePath)"
}

function Remove-UntrackedContent {
  param(
    [string]$RootDir
  )
  if (-not (Test-Path -LiteralPath $RootDir)) {
    return
  }

  $files = Get-ChildItem -LiteralPath $RootDir -Recurse -Force -File -ErrorAction SilentlyContinue
  foreach ($file in $files) {
    $relative = [System.IO.Path]::GetRelativePath((Get-Location).Path, $file.FullName).Replace("\", "/")
    git ls-files --error-unmatch -- "$relative" *> $null
    if ($LASTEXITCODE -eq 0) {
      continue
    }
    Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
  }

  $dirs = Get-ChildItem -LiteralPath $RootDir -Recurse -Force -Directory -ErrorAction SilentlyContinue | Sort-Object FullName -Descending
  foreach ($dir in $dirs) {
    $remaining = Get-ChildItem -LiteralPath $dir.FullName -Force -ErrorAction SilentlyContinue
    if (($remaining | Measure-Object).Count -eq 0) {
      Remove-Item -LiteralPath $dir.FullName -Force -ErrorAction SilentlyContinue
    }
  }
}

$dbUrl = Get-DatabaseUrl
Assert-LocalDatabase -DatabaseUrl $dbUrl
$env:DATABASE_URL = $dbUrl
$fileStorageRoot = [string]$env:FILE_STORAGE_ROOT
if ([string]::IsNullOrWhiteSpace($fileStorageRoot)) {
  $fileStorageRoot = [string](Get-EnvValue -Name "FILE_STORAGE_ROOT")
}
$fileStorageRoot = $fileStorageRoot.Trim()

Write-Output "Resetting Prisma schema on local database..."
pnpm prisma migrate reset --force --skip-seed
if ($LASTEXITCODE -ne 0) {
  throw "Prisma reset failed."
}

Write-Output "Cleaning local runtime artifacts (untracked files only)..."
$targets = @("uploads", "reference_uploads", "submission_marked", "storage")
if (-not [string]::IsNullOrWhiteSpace($fileStorageRoot)) {
  $targets += $fileStorageRoot
}
$targets = $targets | Select-Object -Unique
foreach ($target in $targets) {
  Remove-UntrackedContent -RootDir $target
  if (Test-Path -LiteralPath $target) {
    $count = (Get-ChildItem -LiteralPath $target -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Output "$target files remaining: $count"
  }
}

Write-Output "Local reset complete. Production database/storage were not touched."
