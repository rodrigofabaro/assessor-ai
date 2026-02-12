# Brief extraction (Pearson / UniCourse style briefs)

This document describes the **deterministic** extraction flow for assignment briefs.

Goal: turn an uploaded brief PDF/DOCX into an audit‑friendly structured object:

- header fields (qualification, unit number/title, assignment title, dates, etc.)
- detected assessment criteria codes (P/M/D)
- tasks/questions as an ordered task register
- warnings when structure is unclear

## Files involved (typical)

- PDF → text: `lib/extraction/text/pdfToText.ts`
- Rendering helpers (tables/parts): `lib/extraction/render/*`
- Brief extractor: `lib/extractors/brief.ts`
- Admin UI: `app/admin/briefs/**`

(Exact paths may evolve; keep this list updated when moving files.)

## 1) Page‑aware text extraction

**Rule:** extraction must be page‑aware. A single giant text blob is not acceptable.

Implementation expectations:

- Extract per page.
- Join pages with a hard delimiter (e.g. form‑feed `\f`) so we can reliably map page numbers.
- Persist:
  - `pageCount`
  - `hasFormFeedBreaks`
  - extraction method + engine/version

## 2) Normalization without destroying structure

We normalize *carefully* to preserve headings and table‑like layouts:

- normalize whitespace **per line**, not across the entire page
- remove repeated footers/headers when detected
- preserve blank lines when they help segmentation

**Forbidden:** aggressive “collapse all whitespace” that destroys matrix/table layouts.

## 3) End‑matter detection (stop tasks swallowing “Sources…”) 

Primary anchors (start of end‑matter):

- `Sources of information`
- `Relevant Learning Outcomes and Assessment Criteria`

Secondary headings like `Textbooks`, `Websites`, `Further reading` only start end‑matter if:

- the line is heading‑like (short, no sentence punctuation), **or**
- it appears soon after a primary anchor, **or**
- the parser has already entered the sources block.

This prevents premature task termination when the word “textbooks” appears inside task instructions.

## 4) Task heading detection

Supported heading patterns (examples):

- `Task 1`
- `Task 1: …`
- `Task 1 Activity – …`
- `Task` on one line + `1` on the next line
- optional bullet/stray characters before “Task”

When multiple candidates exist, choose the best using a score:

- +10 title present
- +5 contains `Activity`
- +2 contains `:`, `–`, or `-` followed by text
- −penalty if it looks like a footer/header

Task bodies slice from the chosen heading until the next chosen heading or end‑matter.

## 5) Task sub‑parts (optional, but deterministic)

When present, extract sub‑parts consistently:

- `a) … b) …`
- `i) … ii) …`
- `1. … 2. …`

Store them as structured parts, but always keep the full raw task body too.

## 6) Confidence + warnings

Every extraction run must emit warnings when things look wrong, e.g.:

- missing page breaks
- task body too short
- end‑matter contamination
- “Task 3 missing” when Task 1–2 exist and end‑matter is present

**Truth‑telling rule:** when unsure, mark it as HEURISTIC and warn; never silently pretend it’s clean.

## Current implementation note

If the system is still in “minimal brief core” mode (header + criteria code detection), tasks/questions are the next required step.

The target is a **task register** that preserves:

- task order
- headings
- body blocks
- page refs (where possible)

This is not a question bank. It’s a captured question paper.
