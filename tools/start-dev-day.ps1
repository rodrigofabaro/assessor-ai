param(
  [string]$Repo = "C:\Users\rodri\Website\assessor-ai\webapp"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Resolve-OllamaExe {
  $cmd = Get-Command "ollama" -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    return $cmd.Source
  }

  $candidates = @(
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Ollama\ollama.exe",
    "C:\Program Files\Ollama\ollama.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Test-OllamaRunning {
  try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 2 -ErrorAction Stop
    return ($res.StatusCode -ge 200 -and $res.StatusCode -lt 500)
  } catch {
    return $false
  }
}

if (-not (Test-Path $Repo)) {
  Write-Host "Repo path not found: $Repo" -ForegroundColor Red
  exit 1
}

$ollamaExe = Resolve-OllamaExe
if ($ollamaExe) {
  if (-not (Test-OllamaRunning)) {
    Write-Host "Starting Ollama..." -ForegroundColor Cyan
    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 2
    if (Test-OllamaRunning) {
      Write-Host "Ollama is running." -ForegroundColor Green
    } else {
      Write-Host "Ollama started, but API is not ready yet." -ForegroundColor Yellow
    }
  } else {
    Write-Host "Ollama already running." -ForegroundColor Green
  }
} else {
  Write-Host "Ollama not found. Continuing without local AI server." -ForegroundColor Yellow
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
