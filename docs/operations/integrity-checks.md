# Integrity checks (repo health)

This is the **standard, repeatable** way to verify the repository is in a healthy state.

Assessor‑AI treats these as “health gates”, not optional suggestions.

## Run order

1) Confirm toolchain
- `node -v`
- `pnpm -v`

2) Install dependencies
- `pnpm install`

3) Static quality gates
- `pnpm run lint` (if present)
- `pnpm run typecheck` (if present)
- `pnpm run test` (if present)

4) Build gate
- `pnpm run build`

## How to record evidence (PR discipline)

When Codex (or a human) runs integrity checks, record:

- commands executed
- pass/fail per command
- first meaningful error (with file path)

Prefer putting the **run log** in the PR description, not in git‑tracked docs.

## Failure rules

- If a gate fails, **do not refactor randomly**.
- Fix the smallest, most local cause.
- When a failure is due to missing scripts (e.g., no `typecheck`), mark it as **NOT CONFIGURED**, not “PASS”.

## Recommended scripts

If the project doesn’t have these scripts yet, consider adding them to `package.json`:

- `typecheck`: `tsc -p tsconfig.json --noEmit`
- `test`: your chosen test runner

(Only add scripts when asked; don’t do it as a drive‑by change.)
