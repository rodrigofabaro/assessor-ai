# Assessor‑AI Documentation

This folder is the **operational and audit documentation** for Assessor‑AI.

Assessor‑AI is built to behave like a reliable assessor: every decision must be explainable with **(a) the governing reference document version** and **(b) the exact evidence in the learner work**.

## How to use this docs folder

- Start here for the big picture: **`standards/truth-model.md`**
- If you’re working on brief extraction: **`brief-extraction.md`**
- If you’re working with Codex: **`codex/README.md`** (rules + task template)
- If you’re generating Exam Board outputs: **`standards/exam-board-mode.md`**
- If you’re running repo health checks: **`operations/integrity-checks.md`**
- Roadmap tracker: **`Milestones.md`**

## Non‑negotiable philosophy

1) **Truth over vibes**: no grading without reliable extraction.
2) **Locked means immutable**: reference documents don’t silently change.
3) **Evidence or it didn’t happen**: every “met” claim must cite page/snippet evidence.
4) **Determinism wins**: the same inputs should produce the same outputs.

## What does NOT belong here

- One‑off integrity logs from a specific machine run (store those under a separate `reports/` folder outside git, or in GitHub PR descriptions).
- PDF fixtures / large binaries (keep those in `tests/fixtures/` only when required).
