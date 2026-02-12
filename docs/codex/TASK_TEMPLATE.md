# Codex Task Template (audit‑grade)

Use this template verbatim when sending work to Codex.

## Governing rules
- Read and follow: [NON_NEGOTIABLES](./NON_NEGOTIABLES.md)

## TASK
(1–2 lines. Start with a verb.)

## CONTEXT
- What page/file/feature is affected?
- What is broken today?
- What does “good” look like?
- Include concrete paths, screenshots, console errors, or repro steps.

## SCOPE LIMITS
- Touch ONLY these files:
  - ...
- No new dependencies unless absolutely required.
- Do not redesign globally.

## ACCEPTANCE TESTS
(List observable outcomes. Include commands if relevant.)
- `pnpm run lint`
- `pnpm run build`
- UI flow: ...

## FAILURE MODES (truth‑telling)
- If X is missing, the UI must show ...
- If API returns 409, show ...
- If extraction confidence is low, warn and mark HEURISTIC.

## EVIDENCE REQUIRED IN PR
- Base commit hash
- Files changed list
- Commands run + results
- Before/after screenshots (if UI)
- Notes on any scope expansion
