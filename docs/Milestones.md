# Assessor-AI — Milestones

This is the “boring but reliable” build tracker.
Rule: each milestone ends with a working UI path + DB truth + audit trail.

---

## ✅ M1 — Upload & Tracking Engine (DONE)
**Outcome**
- Upload single + batch submissions (PDF/DOCX)
- Store files on disk + DB record per submission
- Submission list UI + status tracking

**Acceptance**
- Uploads create DB rows
- Files persist and can be re-opened
- Status transitions are consistent and visible

---

## ✅ M2 — Reference Library (Specs/Briefs) (DONE / PARTIAL if still iterating)
**Outcome**
- Admin upload reference docs (unit specs, briefs)
- Parse + store structured reference data
- Bind assignments → criteria universe

**Acceptance**
- Reference docs stored and re-usable
- Assignment “binding” exists and is queryable
- No student grading yet

---

## 🟨 M3 — Extraction Engine (IN PROGRESS)
**Outcome**
- Extract text from PDF/DOCX
- Per-page extraction stored separately from raw file
- Preview UI shows pages + extracted text
- Confidence/meaningful-text guards prevent nonsense

**Acceptance**
- Submission detail page shows:
  - original preview (left)
  - extracted text (right)
  - page navigation stable (no phantom pages)
- DB stores extraction output:
  - page index
  - text
  - method (pdf-text / docx / vision-later)
  - confidence + flags

---

## 🔜 M4 — Student Detail Page (Teacher Tool Feel)
**Outcome**
- `/students/[id]` becomes the main operational cockpit
- Shows student identity + their submission history + latest outcomes
- No duplication: uses existing submissions table and joins

**Acceptance**
- A student page loads instantly and shows:
  - student profile basics
  - timeline/table of all submissions (most recent first)
  - quick filters: assignment / status / date
  - click-through into `/submissions/[submissionId]`

---

## 🔜 M5 — Grading Engine v1 (Explainable JSON)
**Outcome**
- Strict per-criterion decisions with evidence pointers
- Overall grade calculated from criteria
- Human-tone feedback generated from the structured decisions

**Acceptance**
- Given a submission + its bound criteria:
  - produces structured JSON
  - stores model + prompt version
  - stores evidence mapping to extracted text regions/pages

---

## 🔜 M6 — Marked PDF Generator
**Outcome**
- Annotated PDF: highlights/ticks/comments linked to criteria
- Original layout preserved

**Acceptance**
- Downloadable marked PDF attached to submission record
- Annotation log stored for audit

---

## 🔜 M7 — Export Packs (Downstream Friendly)
**Outcome**
- One-click export:
  - authoritative JSON
  - marked PDF
  - optional CSV summary (batch)
  - optional ZIP pack

**Acceptance**
- Export is deterministic and repeatable
- Past exports can be regenerated identically (versioned prompts/models logged)

---

## Notes / Principles
- No grading without reliable extraction.
- Store everything needed to defend a grade.
- Prefer “predictable and boring” over “clever and fragile”.
