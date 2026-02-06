# Codex Non-Negotiables (Assessor-AI)

These rules apply to **every Codex task** unless explicitly stated otherwise.
They exist to preserve auditability, exam-board compliance, and system truth.

## NON-NEGOTIABLES

### 1. Archiving is NOT deletion
- Archive must be reversible
- Archived records remain in the database
- History must never be silently destroyed

### 2. Locked means immutable
- Locked records must not be mutated
- No auto-unlock
- No silent override
- If blocked, explain why in the UI

### 3. No silent failures
- Every mutation must produce visible success or error feedback
- Buttons must never “do nothing”
- Network or validation errors must surface to the user

### 4. No hidden side-effects
- Navigation must not imply mutation
- Mutations must be explicit, intentional, and user-initiated

### 5. Refresh safety
- After refresh, UI must reflect database truth
- Client-only state must never fake success

### 6. Exam-board audit safety
- IDs are stable and never regenerated
- Status transitions are explicit and linear
  (e.g. EXTRACTED → LOCKED → ARCHIVED)
- Historical records are preserved

### 7. Grading logic stability
- Specs, LOs, criteria, and bindings must not change
- No refactors that alter grading semantics unless explicitly requested

---

If a task touches:
• Save
• Delete
• Archive
• Lock
• Extract
• Grade
• Student identity

Then these rules apply by default.
