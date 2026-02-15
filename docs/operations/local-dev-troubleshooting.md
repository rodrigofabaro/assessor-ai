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
