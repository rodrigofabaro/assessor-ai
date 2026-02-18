# Assessor‑AI — Milestones

This is the “boring but reliable” build tracker.

**Rule:** each milestone ends with a working UI path + database truth + audit trail.

Status labels:
- ✅ DONE
- 🟨 IN PROGRESS
- 🔜 NEXT
- 🧊 PARKED

---

## ✅ M1 — Upload & Tracking Engine
**Outcome**
- Upload single + batch submissions (PDF/DOCX)
- Store files on disk + DB record per submission
- Submission list UI + status tracking

**Acceptance**
- Uploads create DB rows
- Files persist and can be re-opened
- Status transitions are consistent and visible

---

## 🟨 M2 — Reference Library (Specs/Briefs)
**Outcome**
- Admin upload reference docs (unit specs, briefs)
- Parse + store structured reference data
- Bind assignments → criteria universe

**Acceptance**
- Reference docs stored and re-usable
- Assignment binding exists and is queryable
- Locked reference versions are immutable

---

## 🟨 M3 — Extraction Engine
**Outcome**
- Extract text from PDF/DOCX
- Per‑page extraction stored separately from raw file
- Preview UI shows pages + extracted text
- Confidence/meaningful‑text guards prevent nonsense

**Acceptance**
- Submission detail page shows:
  - original preview
  - extracted text
  - stable page navigation
- DB stores extraction output:
  - page index
  - text
  - method (pdf‑text / docx / vision‑later)
  - confidence + flags

---

## 🔜 M4 — Student detail cockpit
**Outcome**
- `/students/[id]` becomes the operational cockpit
- Shows student identity + submission history + latest outcomes

**Acceptance**
- Student page shows:
  - profile basics
  - table of submissions (most recent first)
  - filters (assignment / status / date)
  - click-through to `/submissions/[submissionId]`

---

## 🟨 M5 — Grading engine v1 (Explainable JSON)
**Outcome**
- Strict per‑criterion decisions with evidence pointers
- Overall word grade calculated from criteria
- Feedback derived from structured decisions (not freestyle)

**Acceptance**
- Given a submission + bound criteria:
  - produce structured JSON
  - store model + prompt version
  - store evidence mapping to pages/snippets

**Current state (2026-02-18)**
- Structured grading JSON is live in submission assessments.
- Evidence-linked criterion decisions are rendered in `Audit & outputs`.
- Grade vocabulary is constrained to Pearson HN path.

---

## 🟨 M6 — Marked PDF generator
**Outcome**
- Annotated PDF linked to criteria decisions
- Original layout preserved

**Acceptance**
- Downloadable marked PDF attached to submission record
- Annotation log stored for audit

**Current state (2026-02-18)**
- Marked PDF generation is live in grading/rebuild flows.
- Overall summary is placed on final page.
- Constructive page notes are mapped from criterion evidence pages.
- Note payload/config are stored in assessment JSON for audit replay.

---

## 🔜 M7 — Export packs
**Outcome**
- One‑click export pack per submission:
  - authoritative JSON
  - marked PDF
  - optional CSV summary
  - optional ZIP

**Acceptance**
- Export is deterministic and repeatable
- Past exports can be regenerated identically (versions logged)

---

## Maintenance rule
Update milestone status only when you can point to:
- the UI path that proves it
- the DB tables/fields that store it
- the audit event or log that would defend it
