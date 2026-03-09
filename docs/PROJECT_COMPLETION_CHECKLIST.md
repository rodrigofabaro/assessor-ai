# Project Completion Checklist

Last updated: 2026-03-09

Roadmap status:
- Readiness checklist (not canonical roadmap).
- Canonical roadmap is `docs/Milestones.md`.
- Index: `docs/ROADMAP.md`.
- Documentation rules: `docs/DOCS_SYSTEM.md`.

## Current status

- UI consistency pass: completed for core Admin/QA routes, with ongoing polish as needed.
- Lint: passing.
- TypeScript check: passing.
- Regression pack: passing.
- Readiness contract: passing.
- Build: still not reliably confirmed in this environment; current local failures are `prisma generate` hitting `spawn EPERM` and direct `next build` hitting `.next/trace` open `EPERM`.
- Git push: operational from this machine (resolved on 2026-02-27).

## Done

- Admin pages standardized to a shared visual template.
- Primary CTA and interaction styles unified broadly across app routes/components.
- Help docs updated for Admin Overview, Settings, Audit/Users pages.
- Lint issues previously blocking progress resolved.

## Remaining

1. Validate production build end-to-end on a clean Node 20-22 host session.
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

- Local build is not yet host-confirmed because `pnpm build` currently fails in `prisma generate` with `spawn EPERM`, and direct `next build` still shows a `.next/trace` open `EPERM`.
- This machine is outside the declared engine range (`v24.14.0` vs `>=20 <23`), so the next verification pass should be done under Node 20-22 on a clean terminal/session.
