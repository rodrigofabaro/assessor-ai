param(
  [string]$Environment = "production",
  [string]$AppOrigin = "https://www.assessor-ai.co.uk",
  [string]$DeploySmokeBaseUrl = "https://www.assessor-ai.co.uk",
  [string]$AuthEmailFrom = "",
  [string]$ContactEmailFrom = "",
  [string]$ContactFormTo = "",
  [string]$AlertEmailFrom = "",
  [string]$AlertEmailTo = "",
  [string]$ResendApiKey = "",
  [string]$BlobReadWriteToken = "",
  [string]$ProductionDatabaseUrl = "",
  [string]$DeploySmokeUsername = "",
  [string]$DeploySmokePassword = "",
  [switch]$SkipEnvSync,
  [switch]$SkipMigrate,
  [switch]$SkipDeploy,
  [switch]$SkipSmoke,
  [switch]$SkipReleaseGate
)

$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

function New-Stamp {
  $d = Get-Date
  return $d.ToString("yyyyMMdd-HHmmss")
}

function Prompt-Value {
  param(
    [string]$Label,
    [string]$Current = "",
    [string]$Default = "",
    [switch]$Required,
    [switch]$Secret
  )
  $current = [string]$Current
  $default = [string]$Default
  if (-not [string]::IsNullOrWhiteSpace($current)) {
    return $current.Trim()
  }

  while ($true) {
    $hint = if (-not [string]::IsNullOrWhiteSpace($default)) { " [$default]" } else { "" }
    if ($Secret) {
      $secure = Read-Host -AsSecureString "$Label$hint"
      $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
      try {
        $raw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
      } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
      }
    } else {
      $raw = Read-Host "$Label$hint"
    }
    $value = [string]$raw
    if ([string]::IsNullOrWhiteSpace($value)) {
      if (-not [string]::IsNullOrWhiteSpace($default)) {
        $value = $default
      }
    }
    $value = $value.Trim()
    if (-not $Required -or -not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
    Write-Host "Value is required." -ForegroundColor Yellow
  }
}

function New-ResetTokenPepper {
  try {
    $generated = (& node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace([string]$generated)) {
      return ([string]$generated).Trim()
    }
  } catch {}

  $bytes = New-Object byte[] 48
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $base64 = [Convert]::ToBase64String($bytes).TrimEnd("=")
  return $base64.Replace("+", "-").Replace("/", "_")
}

function Assert-Tool {
  param([string]$Name)
  try {
    Get-Command $Name -ErrorAction Stop | Out-Null
  } catch {
    throw "Required tool '$Name' is not available on PATH."
  }
}

function Run-ProcessChecked {
  param(
    [string]$File,
    [string[]]$Args,
    [string]$InputText = ""
  )
  if ([string]::IsNullOrWhiteSpace($InputText)) {
    & $File @Args | Out-Host
  } else {
    $InputText | & $File @Args | Out-Host
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $File $($Args -join ' ')"
  }
}

function Set-VercelEnvValue {
  param(
    [string]$Key,
    [string]$Value,
    [string]$Target,
    [switch]$Optional
  )
  $trimmed = [string]$Value
  $trimmed = $trimmed.Trim()

  try {
    & vercel env rm $Key $Target -y *> $null
  } catch {}

  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    if ($Optional) {
      Write-Host "Env $Key left unset for $Target." -ForegroundColor DarkYellow
      return
    }
    throw "Missing required value for env '$Key'."
  }

  Run-ProcessChecked -File "vercel" -Args @("env", "add", $Key, $Target) -InputText $trimmed
}

function Run-Step {
  param(
    [string]$Id,
    [string]$Command,
    [scriptblock]$Action
  )
  $started = Get-Date
  $status = 0
  $ok = $true
  $errorMessage = $null
  try {
    & $Action
  } catch {
    $status = 1
    $ok = $false
    $errorMessage = [string]$_.Exception.Message
  }
  $ended = Get-Date
  $step = [ordered]@{
    id = $Id
    command = $Command
    startedAt = $started.ToString("o")
    endedAt = $ended.ToString("o")
    durationMs = [int][Math]::Round(($ended - $started).TotalMilliseconds)
    status = $status
    ok = $ok
    error = $errorMessage
  }
  $script:result.steps += $step
  if (-not $ok) {
    $script:result.summary.ok = $false
    $script:result.summary.failedStep = $Id
    throw "Step '$Id' failed: $errorMessage"
  }
  $script:result.summary.passedSteps += 1
}

$script:result = [ordered]@{
  generatedAt = (Get-Date).ToString("o")
  gate = "cutover-prod"
  environment = $Environment
  appOrigin = $AppOrigin
  deploySmokeBaseUrl = $DeploySmokeBaseUrl
  steps = @()
  summary = [ordered]@{
    ok = $true
    failedStep = $null
    totalSteps = 0
    passedSteps = 0
    message = ""
  }
}

$failureMessage = $null

try {
  Assert-Tool -Name "pnpm"
  Assert-Tool -Name "node"
  if (-not $SkipEnvSync -or -not $SkipDeploy) {
    Assert-Tool -Name "vercel"
  }

  if (-not $SkipEnvSync) {
    $AuthEmailFrom = Prompt-Value -Label "AUTH_EMAIL_FROM" -Current $AuthEmailFrom -Default "Assessor AI <no-reply@assessor-ai.co.uk>" -Required
    $ContactEmailFrom = Prompt-Value -Label "CONTACT_EMAIL_FROM" -Current $ContactEmailFrom -Default $AuthEmailFrom
    $ContactFormTo = Prompt-Value -Label "CONTACT_FORM_TO" -Current $ContactFormTo -Default "support@assessor-ai.co.uk" -Required
    $AlertEmailFrom = Prompt-Value -Label "ALERT_EMAIL_FROM" -Current $AlertEmailFrom -Default $AuthEmailFrom
    $AlertEmailTo = Prompt-Value -Label "ALERT_EMAIL_TO (leave empty to disable alerts)" -Current $AlertEmailTo -Default "alerts@assessor-ai.co.uk"
    $ResendApiKey = Prompt-Value -Label "RESEND_API_KEY" -Current $ResendApiKey -Required -Secret
    $BlobReadWriteToken = Prompt-Value -Label "BLOB_READ_WRITE_TOKEN" -Current $BlobReadWriteToken -Required -Secret
  }

  if (-not $SkipMigrate) {
    $ProductionDatabaseUrl = Prompt-Value -Label "Production DATABASE_URL" -Current $ProductionDatabaseUrl -Required -Secret
  }

  if (-not $SkipSmoke -or -not $SkipReleaseGate) {
    $DeploySmokeBaseUrl = Prompt-Value -Label "DEPLOY_SMOKE_BASE_URL" -Current $DeploySmokeBaseUrl -Default $AppOrigin -Required
    $DeploySmokeUsername = Prompt-Value -Label "DEPLOY_SMOKE_USERNAME" -Current $DeploySmokeUsername -Required
    $DeploySmokePassword = Prompt-Value -Label "DEPLOY_SMOKE_PASSWORD" -Current $DeploySmokePassword -Required -Secret
  }

  $steps = @()
  if (-not $SkipEnvSync) { $steps += "env_sync" }
  if (-not $SkipMigrate) { $steps += "migrate_deploy" }
  if (-not $SkipDeploy) { $steps += "vercel_deploy_prod" }
  if (-not $SkipSmoke) { $steps += "deploy_smoke" }
  if (-not $SkipReleaseGate) { $steps += "release_gate" }
  $script:result.summary.totalSteps = $steps.Count

  if (-not $SkipEnvSync) {
    Run-Step -Id "env_sync" -Command "vercel env add/rm (...)" -Action {
      $pepper = New-ResetTokenPepper
      Set-VercelEnvValue -Key "STORAGE_BACKEND" -Value "vercel_blob" -Target $Environment
      Set-VercelEnvValue -Key "BLOB_READ_WRITE_TOKEN" -Value $BlobReadWriteToken -Target $Environment
      Set-VercelEnvValue -Key "AUTH_INVITE_EMAIL_PROVIDER" -Value "resend" -Target $Environment
      Set-VercelEnvValue -Key "RESEND_API_KEY" -Value $ResendApiKey -Target $Environment
      Set-VercelEnvValue -Key "AUTH_EMAIL_FROM" -Value $AuthEmailFrom -Target $Environment
      Set-VercelEnvValue -Key "CONTACT_EMAIL_FROM" -Value $ContactEmailFrom -Target $Environment -Optional
      Set-VercelEnvValue -Key "CONTACT_FORM_TO" -Value $ContactFormTo -Target $Environment
      Set-VercelEnvValue -Key "ALERT_EMAIL_FROM" -Value $AlertEmailFrom -Target $Environment -Optional
      Set-VercelEnvValue -Key "ALERT_EMAIL_TO" -Value $AlertEmailTo -Target $Environment -Optional
      Set-VercelEnvValue -Key "AUTH_APP_ORIGIN" -Value $AppOrigin -Target $Environment
      Set-VercelEnvValue -Key "RESET_TOKEN_PEPPER" -Value $pepper -Target $Environment
      Set-VercelEnvValue -Key "AUTH_REQUIRE_RECOVERY_EMAIL" -Value "true" -Target $Environment
    }
  }

  if (-not $SkipMigrate) {
    Run-Step -Id "migrate_deploy" -Command "pnpm prisma migrate deploy" -Action {
      $previousDatabaseUrl = [string]$env:DATABASE_URL
      try {
        $env:DATABASE_URL = $ProductionDatabaseUrl
        Run-ProcessChecked -File "pnpm" -Args @("prisma", "migrate", "deploy")
      } finally {
        if ([string]::IsNullOrWhiteSpace($previousDatabaseUrl)) {
          Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
        } else {
          $env:DATABASE_URL = $previousDatabaseUrl
        }
      }
    }
  }

  if (-not $SkipDeploy) {
    Run-Step -Id "vercel_deploy_prod" -Command "vercel --prod" -Action {
      Run-ProcessChecked -File "vercel" -Args @("--prod")
    }
  }

  if (-not $SkipSmoke -or -not $SkipReleaseGate) {
    $env:DEPLOY_SMOKE_BASE_URL = $DeploySmokeBaseUrl
    $env:DEPLOY_SMOKE_USERNAME = $DeploySmokeUsername
    $env:DEPLOY_SMOKE_PASSWORD = $DeploySmokePassword
  }

  if (-not $SkipSmoke) {
    Run-Step -Id "deploy_smoke" -Command "pnpm run ops:deploy-smoke" -Action {
      Run-ProcessChecked -File "pnpm" -Args @("run", "ops:deploy-smoke")
    }
  }

  if (-not $SkipReleaseGate) {
    Run-Step -Id "release_gate" -Command "pnpm run ops:release-gate" -Action {
      Run-ProcessChecked -File "pnpm" -Args @("run", "ops:release-gate")
    }
  }

  $script:result.summary.message = "cutover flow completed"
} catch {
  $failureMessage = [string]$_.Exception.Message
  if ([string]::IsNullOrWhiteSpace($script:result.summary.message)) {
    $script:result.summary.message = $failureMessage
  }
}

$relDir = "docs/evidence/cutover-prod"
$absDir = Join-Path (Get-Location).Path $relDir
New-Item -ItemType Directory -Path $absDir -Force | Out-Null
$relPath = "$relDir/$(New-Stamp).json"
$absPath = Join-Path (Get-Location).Path $relPath

$json = $script:result | ConvertTo-Json -Depth 10
Set-Content -Path $absPath -Value "$json`n" -Encoding utf8

if ($script:result.summary.ok) {
  Write-Host "cutover flow passed: $relPath"
  exit 0
}

Write-Error "cutover flow failed: $failureMessage"
Write-Host "evidence: $relPath"
exit 1
