# Project Completion Checklist

Last updated: 2026-02-18

## Current status

- UI consistency pass: in progress, major routes completed.
- Lint: passing.
- TypeScript check: passing.
- Build: not yet reliably confirmed in this environment due `.next/trace` lock/timeouts.
- Git push: blocked by local GitHub credentials on this machine.

## Done

- Admin pages standardized to a shared visual template.
- Primary CTA and interaction styles unified broadly across app routes/components.
- Help docs updated for Admin Overview, Settings, Audit/Users pages.
- Lint issues previously blocking progress resolved.

## Remaining

1. Validate production build end-to-end on host machine.
2. Run all script-level smoke tests and record outcomes.
3. Manual QA pass on critical flows:
   - Upload -> extract -> resolve -> grade -> marked PDF.
   - Admin reference/spec/brief locking workflows.
   - QA and audit navigation/reporting paths.
4. Push commits to remote after restoring Git credentials.
5. Deploy and perform post-deploy smoke checks.

## Recommended command runbook

```bash
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm run test:tasks-tab
pnpm run test:ai-fallback
pnpm run test:word-math
pnpm run test:grading-schema
pnpm run test:extraction-readiness
pnpm run test:extraction-integrity
pnpm run test:brief-readiness
pnpm run build
```

## Deployment blockers to clear

- Git auth error seen while pushing:
  - `SEC_E_NO_CREDENTIALS (0x8009030E)`
- Intermittent local `.next/trace` lock during build; clear lock and rerun build on clean terminal/session.
