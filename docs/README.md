# Assessor‑AI Documentation

This folder is the **operational and audit documentation** for Assessor‑AI.

Assessor‑AI is built to behave like a reliable assessor: every decision must be explainable with **(a) the governing reference document version** and **(b) the exact evidence in the learner work**.

## How to use this docs folder

- Start here for the big picture: **`standards/truth-model.md`**
- If you’re working on brief extraction: **`brief-extraction.md`**
- If you’re working with Codex: **`codex/README.md`** (rules + task template)
- If you’re generating Exam Board outputs: **`standards/exam-board-mode.md`**
- If you’re running repo health checks: **`operations/integrity-checks.md`**
- If local server startup fails: **`operations/local-dev-troubleshooting.md`**
- If you operate the submission queue UI: **`operations/submissions-workspace-guide.md`**
- If you operate Phase 1 grading flow: **`operations/phase1-submission-grading-runbook.md`**
- If you need GradeRun v2 hardening internals and controls: **`operations/grading-hardening-system.md`**
- If you’re operating OpenAI settings/usage diagnostics: **`operations/openai-settings.md`**
- If you’re tracking operational bottlenecks and priorities: **`operations/areas-of-improvement.md`**
- If you’re enabling local-first AI with fallback: **`operations/hybrid-ai-local-runbook.md`**
- If you need route-by-route operator help content: **`help/README.md`**
- Roadmap tracker: **`Milestones.md`**

## Quick start (local)

1) Confirm Node + pnpm are available in the current shell.
- `node -v`
- `pnpm -v`

2) Install dependencies.
- `pnpm install`

3) Start the app.
- `pnpm dev`

4) Open the URL shown in terminal output.
- Typical: `http://localhost:3000`
- If port 3000 is already in use, Next.js will choose another port (for example `http://localhost:3001`).

## Recent updates

### 2026-02-18

- Submission detail and grading UX finalization:
  - compact left rail with collapsed-by-default operational cards
  - top blocker strip + single primary run action
  - outputs-first workflow after grading (auto-opens `Audit & outputs`)
  - copy actions for feedback and criterion decisions
- Marked PDF upgrades:
  - overall grading summary moved to final page
  - constructive note overlays mapped to evidence pages from criterion decisions
  - note pages visible in PDF header via clickable page chips
- Admin grading settings extended:
  - page-note controls: enable flag, tone, max pages, max notes/page, include criterion-code flag
  - tone preview panel for note styles
- Audit/output defensibility improvements:
  - feedback edits log enhanced in admin audit feed (`FEEDBACK_EDITED`)
  - page-note payload/config are stored in assessment result JSON for reproducibility
- Assessor identity policy:
  - assessor is always current active audit user; submission UI no longer allows manual assessor override

### 2026-02-17

- Brief extraction/rendering hardening:
  - chart previews now require image provenance (no synthetic chart previews from plain table text)
  - shared draft artifact sanitizer now runs on extraction save + manual draft save
  - failure-table/equation/chart leakage cleanup is enforced globally
- Brief criteria mapping panel now runs in extraction-driven read-only mode:
  - no manual criteria checkbox selection flow
  - lock uses detected criteria from brief extraction
  - criteria display is forced to `P -> M -> D` order
  - current-brief LO spillover is suppressed for ambiguous code collisions
  - LO descriptions are shown in the panel
- Warnings/readiness cleanup:
  - stale non-actionable warnings are filtered from UI
  - resolved equation/short-body warnings are automatically suppressed
- Submissions Phase 1 simplification:
  - optional `SUBMISSION_EXTRACT_COVER_ONLY=true` mode for cover-first extraction
  - cover metadata readiness is now a first-class extraction quality signal
  - triage falls back to cover metadata signals (unit/assignment/student)
  - grading prompt uses page samples as primary evidence context
  - grading auto-starts after extraction/triage when links are complete
  - cover metadata gaps are non-blocking and editable on submission detail
  - feedback summary is personalized with student first name (profile first, cover fallback)
  - accepted grade words aligned to Pearson HN flow:
    - `REFER`, `PASS`, `PASS_ON_RESUBMISSION`, `MERIT`, `DISTINCTION`

## Non‑negotiable philosophy

1) **Truth over vibes**: no grading without reliable extraction.
2) **Locked means immutable**: reference documents don’t silently change.
3) **Evidence or it didn’t happen**: every “met” claim must cite page/snippet evidence.
4) **Determinism wins**: the same inputs should produce the same outputs.

## What does NOT belong here

- One‑off integrity logs from a specific machine run (store those under a separate `reports/` folder outside git, or in GitHub PR descriptions).
- PDF fixtures / large binaries (keep those in `tests/fixtures/` only when required).
