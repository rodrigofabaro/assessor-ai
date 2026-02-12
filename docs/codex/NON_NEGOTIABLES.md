# Codex Non‑Negotiables (Assessor‑AI)

These rules apply to **every Codex task** unless the task explicitly overrides them.
They exist to preserve **auditability, exam‑board compliance, and database truth**.

## 0) Do no harm to truth
- Never “fix” a problem by hiding it.
- Never fabricate extracted content, grades, or audit fields.

## 1) Git discipline
- Start from the branch stated in the task (default `main`).
- Do **not** commit to `main`.
- One task = one branch = one PR.
- Record the base commit hash in the PR description.

## 2) Locked means immutable
- Locked specs/briefs must not be mutated.
- No auto‑unlock.
- No silent override.
- If an action is blocked, the UI must explain why.

## 3) Archiving is not deletion
- Archive must be reversible.
- Archived records remain in the database.
- History must not be silently destroyed.

## 4) No silent failures
- Buttons must never “do nothing”.
- Every mutation must produce visible success or error feedback.
- Errors must surface to the user (validation/network/permissions).

## 5) No hidden side‑effects
- Navigation must not imply mutation.
- Mutations must be explicit and user‑initiated.
- “Refresh” should refetch data, not change meaning/state.

## 6) Refresh safety
- After refresh, UI must reflect database truth.
- Client‑only state must never fake success.

## 7) Determinism over cleverness
- Prefer small, boring, local changes.
- Avoid global redesigns unless requested.
- Avoid heuristic‑only logic when a deterministic anchor exists.

## 8) Evidence‑based changes
When a task touches:
- Save / Delete / Archive / Lock
- Extract / Grade
- Student identity / linking

…then every change must have:
- acceptance tests
- failure modes
- evidence (logs, error strings, or UI proof)

## 9) No dependency drift
- No new dependencies unless unavoidable.
- If you add one, explain why and how it’s pinned.

## 10) No secrets
- Never print `.env` values.
- Do not paste tokens/keys into code or docs.
- Env var **names** are OK.
