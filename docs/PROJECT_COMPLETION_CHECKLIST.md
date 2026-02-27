# Project Completion Checklist

Last updated: 2026-02-27

## Current status

- UI consistency pass: completed for core Admin/QA routes, with ongoing polish as needed.
- Lint: passing.
- TypeScript check: passing.
- Build: still not reliably confirmed in this environment due intermittent `.next/trace` lock/timeouts.
- Git push: operational from this machine (resolved on 2026-02-27).

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
4. Deploy and perform post-deploy smoke checks.
5. Rework Help Center quality (deferred).
6. Rebuild `/help/submissions-support` as a true operator tutorial (deferred).
7. Rebuild `/help/submissions-onboarding` with realistic first-run training artifacts (deferred).

## Deferred help tasks (requested for later stage)

1. Rewrite help pages with task-based, role-specific tutorials instead of reference-style text.
2. Replace generic screenshots with real, current UI captures for each critical step.
3. Add explicit "Do / Expect / If fails" blocks to each tutorial step.
4. Add a full walkthrough for `/submissions` covering:
   - unlinked resolution
   - blocked-lane triage
   - auto-ready auto-grading verification
   - QA preview -> commit integrity checks
5. Add acceptance QA for help content:
   - a new operator can execute the flow without verbal guidance
   - screenshots and labels match the current UI
   - links between daily support and onboarding pages are consistent

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

- Intermittent local `.next/trace` lock during build; clear lock and rerun build on clean terminal/session.
