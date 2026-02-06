param(
  [string]$Prefix = "origin/codex/",
  [switch]$Checkout,
  [switch]$Diff
)

git fetch --prune origin | Out-Null

# Get newest codex remote branch by committer date
$latest = git for-each-ref `
  --sort=-committerdate `
  --format="%(refname:short)" `
  refs/remotes/origin/codex | Select-Object -First 1

if (-not $latest) {
  Write-Host "No remote branches under origin/codex found." -ForegroundColor Red
  exit 1
}

Write-Host "Latest Codex remote branch: $latest" -ForegroundColor Cyan

if ($Diff) {
  git diff --stat main..$latest
}

if ($Checkout) {
  # Create a stable local branch name from it
  $local = ($latest -replace '^origin/','') -replace '[\/]+','-'
  Write-Host "Checking out local branch: $local" -ForegroundColor Cyan

  git show-ref --verify --quiet "refs/heads/$local"
  if ($LASTEXITCODE -ne 0) {
    git switch -c $local --track $latest
  } else {
    git switch $local
    git reset --hard $latest
  }
}
