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
- If local dev feels slow: **`operations/local-dev-troubleshooting.md`** (see section 5)
- If you’re operating OpenAI settings/usage diagnostics: **`operations/openai-settings.md`**
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

## Recent updates (2026-02-13)

- Admin dashboard **System** card now routes to `/admin/settings`.
- Added OpenAI settings page with:
  - API connectivity status
  - organization usage and spend/cost metrics
  - local historical usage fallback telemetry
  - endpoint diagnostics
  - model selection dropdown for agent operations
- Added admin model config API and persisted model config.

## Non‑negotiable philosophy

1) **Truth over vibes**: no grading without reliable extraction.
2) **Locked means immutable**: reference documents don’t silently change.
3) **Evidence or it didn’t happen**: every “met” claim must cite page/snippet evidence.
4) **Determinism wins**: the same inputs should produce the same outputs.

## What does NOT belong here

- One‑off integrity logs from a specific machine run (store those under a separate `reports/` folder outside git, or in GitHub PR descriptions).
- PDF fixtures / large binaries (keep those in `tests/fixtures/` only when required).
