# QA & IV Alignment Notes (Pearson‑style)

Assessor‑AI is being built to behave like a disciplined assessor with an audit trail. This document lists the **QA/IV behaviours** the product should support, based on typical Pearson expectations for:

- **clear assessment decisions against criteria**
- **formative feedback that helps learners improve**
- **records that support standardisation, IV, and external review**

## 1) Formative vs summative decisions

- Formative feedback helps the student improve and is **not** a final grade decision.
- Summative assessment is the final decision on which criteria are met and must be clearly recorded.

Product implication:
- Store a clear boundary between “draft/formative notes” and “final grade + criterion decisions”.

## 2) Evidence‑based decisions

Every decision must be anchored to evidence from the learner’s submission.

Product implication:
- For each criterion: store (a) decision, (b) cited evidence snippet(s), (c) short rationale.
- Keep references to the page number(s) where evidence was found.

## 3) Quality assurance traceability

A QA‑friendly assessment record normally includes:
- upload timestamp and marking timestamp
- assessor identity (and later: tutor account)
- source file (original) and any produced outputs (annotated pdf)
- versioning: extraction engine version, grading prompt/model version

Product implication:
- Audit events (link/unlink student, overrides, re‑runs) should be stored as events, not overwritten.

## 4) Standardisation / consistency

Even when a single person marks, standardisation is about doing the same thing the same way.

Product implication:
- Keep an immutable “criteria source” (locked spec/brief) that each grading run references.
- Allow re‑runs while preserving earlier results for comparison.

## 5) AI: assistive, not the sole marker

Where AI is used to support marking, the human assessor remains responsible for the final judgement.

Product implication:
- Always provide “evidence + explanation” so a human can confirm quickly.
- Include a simple human check step before a result is marked DONE.

## 6) AI‑use indicators (non‑accusatory)

We want **signals**, not a “gotcha”.

Product implication:
- Store a lightweight set of indicators (e.g., writing style inconsistency, suspiciously generic content, missing working, abrupt jumps), presented as “possible indicators” rather than a verdict.

## 7) Annotated PDF expectations

We will not alter the learner’s original content.

Product implication:
- Overlay ticks/highlights/short comments.
- Preserve original layout.
- Store the produced PDF alongside the original.
