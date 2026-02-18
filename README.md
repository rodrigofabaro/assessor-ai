# Assessor-AI Webapp

Operational documentation lives in `docs/README.md`.

## Quick start

1. Check tooling:
   - `node -v`
   - `pnpm -v`

2. Install dependencies:
   - `pnpm install`

3. Run the dev server:
   - `pnpm dev`

If port `3000` is already in use, Next.js will start on another port (for example `3001`).

## Key docs

- Docs hub: `docs/README.md`
- Local startup troubleshooting: `docs/operations/local-dev-troubleshooting.md`
- Integrity checks: `docs/operations/integrity-checks.md`
- Codex workflow: `docs/codex/README.md`
- Submission operations: `docs/operations/submissions-workspace-guide.md`
- Phase 1 grading runbook: `docs/operations/phase1-submission-grading-runbook.md`
- OpenAI settings operations: `docs/operations/openai-settings.md`

## Common commands

- Lint: `pnpm run lint`
- Build: `pnpm run build`
- Full test alias: `pnpm run test`
- Tasks tab logic test: `pnpm run test:tasks-tab`
- AI fallback policy test: `pnpm run test:ai-fallback`
- Word math test: `pnpm run test:word-math`
- Grading schema test: `pnpm run test:grading-schema`
- Extraction readiness test: `pnpm run test:extraction-readiness`
- Extraction integrity test: `pnpm run test:extraction-integrity`
- Brief readiness test: `pnpm run test:brief-readiness`
- Draft artifact integrity test: `node scripts/draft-integrity.test.js`
- Marked PDF URL test: `node scripts/marked-pdf-url.test.js`
- Page notes logic test: `node scripts/page-notes.test.js`

## Current behavior notes (briefs)

- Criteria mapping UI is extraction-driven (read-only); no manual criteria checkbox mapping.
- Locking a brief uses detected criteria from extraction (`AUTO_FROM_BRIEF` path).
- Current-brief criteria display is LO-scoped and ordered `P -> M -> D`.
- Stale extraction/task warnings are auto-filtered when resolved.

## Current navigation notes (admin)

- Primary admin top-nav sections are: `Audit`, `Briefs`, `Library`, `Overview`, `QA`, `Settings`, `Specs`, `Students`, `Users`.
- Advanced admin pages are still available by direct URL:
  - `/admin/reference`
  - `/admin/bindings`

## Current behavior notes (submissions, Phase 1)

- Submission grading supports cover-first processing:
  - extraction mode can run in `COVER_ONLY` (default for Phase 1) or `FULL`
  - cover metadata is extracted for identity/linking and readiness decisions
- Triage can resolve signals from latest cover metadata when body text is minimal.
- Grading is evidence-led from page samples + linked references, with extracted body text as secondary fallback.
- Grading auto-starts after extraction/triage when submission linking is complete.
- Cover metadata can be edited in submission detail without blocking grading.
- Feedback summary uses student first name and updates on re-grade after name corrections.
- Marked PDF behavior:
  - overall feedback summary is rendered on the last page
  - constructive page notes are rendered on evidence-linked pages
  - page note behavior is admin-configurable (enable/tone/limits/code flag)
- Assessor identity:
  - assessor is always the active current audit user (not manually editable in submission view)
- Submission detail (`/submissions/[submissionId]`) now includes:
  - compact top blocker strip + primary run action
  - editable audit feedback with marked-PDF regenerate path
  - assessment run history, page feedback map, and run-to-run diffs
