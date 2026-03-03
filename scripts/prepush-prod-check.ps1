param(
  [switch]$AllowDirty,
  [switch]$AllowMain
)

$ErrorActionPreference = "Stop"

function New-Stamp {
  $d = Get-Date
  return $d.ToString("yyyyMMdd-HHmmss")
}

function Run-Step {
  param(
    [string]$Id,
    [string[]]$StepArgs
  )
  $started = Get-Date
  & pnpm @StepArgs | Out-Host
  $code = $LASTEXITCODE
  $ended = Get-Date
  return [ordered]@{
    id = $Id
    command = "pnpm $($StepArgs -join ' ')"
    startedAt = $started.ToString("o")
    endedAt = $ended.ToString("o")
    durationMs = [int][Math]::Round(($ended - $started).TotalMilliseconds)
    status = $code
    ok = ($code -eq 0)
  }
}

$generatedAt = (Get-Date).ToString("o")
$branch = $null
$dirtyCount = -1

try {
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
} catch {
  $branch = $null
}

try {
  $dirtyLines = @(git status --porcelain)
  $dirtyCount = $dirtyLines.Count
} catch {
  $dirtyCount = -1
}

$result = [ordered]@{
  generatedAt = $generatedAt
  gate = "prepush-prod"
  git = [ordered]@{
    branch = $branch
    dirtyCount = $dirtyCount
    allowDirty = [bool]$AllowDirty
    allowMain = [bool]$AllowMain
  }
  steps = @()
  summary = [ordered]@{
    ok = $true
    failedStep = $null
    totalSteps = 4
    passedSteps = 0
    message = ""
  }
  nextRequiredGates = @(
    "Validate Vercel preview deployment for this branch before merge.",
    "After merge to main, run pnpm run ops:release-gate and keep evidence artifact.",
    "After production deploy, run pnpm run ops:deploy-smoke against deployed URL."
  )
}

if (-not $branch) {
  $result.summary.ok = $false
  $result.summary.failedStep = "git_branch"
  $result.summary.message = "Could not resolve current git branch."
} elseif (($branch -eq "main") -and (-not $AllowMain)) {
  $result.summary.ok = $false
  $result.summary.failedStep = "git_branch_policy"
  $result.summary.message = "Current branch is main. Use a feature branch, or rerun with --AllowMain."
} elseif (($dirtyCount -gt 0) -and (-not $AllowDirty)) {
  $result.summary.ok = $false
  $result.summary.failedStep = "git_clean_tree"
  $result.summary.message = "Working tree is dirty ($dirtyCount entries). Commit/stash changes, or rerun with --AllowDirty."
}

if ($result.summary.ok) {
  Remove-Item ".next\trace" -Force -ErrorAction SilentlyContinue

  $steps = @(
    @{ id = "tsc"; stepArgs = @("exec", "tsc", "--noEmit", "--incremental", "false") },
    @{ id = "build"; stepArgs = @("run", "build") },
    @{ id = "regression_pack"; stepArgs = @("run", "test:regression-pack") },
    @{ id = "export_pack_validation"; stepArgs = @("run", "test:export-pack-validation") }
  )

  foreach ($s in $steps) {
    $stepResult = Run-Step -Id $s.id -StepArgs $s.stepArgs
    $result.steps += $stepResult
    if (-not $stepResult.ok) {
      $result.summary.ok = $false
      $result.summary.failedStep = $s.id
      $result.summary.message = "Failed at step $($s.id)."
      break
    }
    $result.summary.passedSteps += 1
  }

  if ($result.summary.ok) {
    $result.summary.message = "pre-push production checklist passed"
  }
}

$relDir = "docs/evidence/prepush-prod"
$absDir = Join-Path (Get-Location).Path $relDir
New-Item -ItemType Directory -Path $absDir -Force | Out-Null
$relPath = "$relDir/$(New-Stamp).json"
$absPath = Join-Path (Get-Location).Path $relPath

$json = $result | ConvertTo-Json -Depth 8
Set-Content -Path $absPath -Value "$json`n" -Encoding utf8

if (-not $result.summary.ok) {
  Write-Error "pre-push production checklist failed: $($result.summary.message)"
  Write-Host "evidence: $relPath"
  exit 1
}

Write-Host "pre-push production checklist passed: $relPath"
exit 0
