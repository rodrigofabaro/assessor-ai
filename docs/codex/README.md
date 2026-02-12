# Codex operating manual (Assessor‑AI)

Codex is most useful when it is treated like a junior engineer who:
- can read the whole codebase quickly
- can make precise changes
- will absolutely do the wrong thing **correctly** if you give it vague instructions

This folder contains:
- the **non‑negotiable rules** Codex must follow
- a **task template** that forces evidence + acceptance tests
- example tasks

## Golden rule
Always give Codex a bundle:

**TASK + CONTEXT + ACCEPTANCE + FAILURE MODES + EVIDENCE**

If you skip one, you get vibes.

## Branch / PR discipline
- Start from `main` unless instructed otherwise.
- Create a new branch for each task (`codex/<short-topic>`).
- Never commit directly to `main`.
- In PR description:
  - record the base commit hash
  - list files changed
  - include commands run and results

## Scope discipline
- Touch only the files listed in the task.
- If you must expand scope, you must justify why.
- No new dependencies unless unavoidable.

## Evidence discipline
For any claim like “this fixes X”:
- point to the exact file/function changed
- include the error message or before/after behaviour
- include a short log snippet or screenshot reference if UI‑related

## Required reading
- [NON_NEGOTIABLES](./NON_NEGOTIABLES.md)
- [TASK_TEMPLATE](./TASK_TEMPLATE.md)

