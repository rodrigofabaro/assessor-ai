# Environment Contract

Last updated: 2026-03-03

This is the canonical environment contract for deployment and runtime startup validation.

## Critical runtime requirements

1. `DATABASE_URL`
- Required in all environments.
- Used by Prisma and all DB-backed routes.

2. OpenAI credential (at least one must be set)
- `OPENAI_ADMIN_KEY` (preferred), or
- `OPENAI_ADMIN_API_KEY`, or
- `OPENAI_ADMIN`, or
- `OPENAI_API_KEY` (fallback)

Without one of these keys, grading and AI-assisted extraction/review routes will fail.

## Runtime startup validation behavior

Validation is centralized in `lib/runtimeEnvContract.ts` and invoked from:
- `app/layout.tsx`
- `lib/prisma.ts`

Behavior:
- Production runtime: fails hard on missing critical requirements.
- Build/dev/test: logs warning only by default.

Overrides:
- Force strict mode in any environment: `ENV_CONTRACT_ENFORCE=true`
- Disable contract checks: `ENV_CONTRACT_DISABLE=true`

## Canonical source of env keys

- Base template: `.env.example`
- OpenAI ops detail: `docs/operations/openai-settings.md`
- Hybrid/local overrides: `docs/operations/hybrid-ai-local-runbook.md`
