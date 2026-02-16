# Local dev troubleshooting

Use this when `pnpm dev` does not start as expected.

## 1) Tooling not found in shell

Symptom:
- `pnpm`, `npm`, or `node` is reported as "not recognized".

Checks:
- `node -v`
- `pnpm -v`
- `Get-Command node`
- `Get-Command pnpm`

Typical cause:
- Node is installed (often via NVM for Windows), but your current shell session does not have the expected PATH entries.

Actions:
1. Open a fresh terminal and re-run `node -v` and `pnpm -v`.
2. If still failing, verify your Node install path (example: `C:\nvm4w\nodejs`).
3. Ensure your shell profile or system PATH includes the active Node install path.

## 2) `pnpm dev` starts but uses a different port

Symptom:
- Next.js prints a warning like "Port 3000 is in use ... using available port 3001 instead."

Meaning:
- The app is running, just not on port 3000.

Actions:
1. Use the URL printed by Next.js (for example `http://localhost:3001`).
2. If you must use port 3000, find and stop the occupying process:
- `Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess`
- `Get-Process -Id <PID>`
- `Stop-Process -Id <PID>`
3. Restart dev server:
- `pnpm dev`

## 3) Permission errors (`EPERM`) before app startup

Symptom:
- Errors such as `EPERM: operation not permitted` while resolving paths.

Typical cause:
- Environment or sandbox restrictions block filesystem access in the current execution context.

Actions:
1. Run the same command in your normal local terminal (outside restricted runners).
2. Confirm the working directory is accessible:
- `Get-Location`
- `Get-ChildItem .`
3. Re-run `pnpm dev` after confirming directory and permissions.

## 4) Capture startup logs for debugging

If startup is inconsistent, capture logs and review the first error:
- `pnpm dev *> .dev-startup.log`

Then inspect:
- `Get-Content .dev-startup.log`

Keep only short, relevant snippets in issue/PR notes.

## 5) App is slow locally (high CPU, sluggish reloads)

Symptom:
- UI feels slow even on localhost.
- `node` CPU is high while idle.
- Lots of background requests to `/api/dev/build-info`.

Common cause in this repo:
- In development, `DevBuildBadge` polls build info.
- Build info endpoint runs git commands (`git status --porcelain`, `git rev-parse ...`).
- With many untracked temp files and multiple open tabs, this creates constant disk/CPU load.

Checks:
- Confirm repeated build-info calls in browser network tab.
- Measure git status cost:
  - `Measure-Command { git status --porcelain | Out-Null }`
- Check for heavy local temp folders:
  - `.tmp-iv-docx/`
  - `.tmp-mock-submissions/`
  - large `.tmp-*` artifacts

Fixes already applied:
1. Dev badge polling reduced and visibility-aware.
- Poll interval changed from 2s to 15s.
- Polling pauses when tab is hidden.
2. Build-info route now caches git-derived payload for 30s in memory.
3. Local temp/debug artifacts added to `.gitignore`:
- `.tmp-iv-docx/`
- `.tmp-mock-submissions/`
- `.codex-dev.log`
- `.codex-dev.err`

If still slow:
1. Close duplicate browser tabs on the app.
2. Kill orphaned `next dev`/`node` processes and restart:
- `Get-Process node`
- `Stop-Process -Id <PID>`
- `pnpm dev`
3. Run a clean dev boot once:
- `pnpm run dev:clean`
