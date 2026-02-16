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
