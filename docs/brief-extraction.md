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

## 7) Artifact integrity cleanup (global)

After extraction (and also on manual draft save), the system runs a shared sanitizer:

- file: `lib/extraction/brief/draftIntegrity.ts`
- wired in:
  - `app/api/reference-documents/extract/route.ts`
  - `app/api/reference-documents/[documentId]/meta/route.ts`

The sanitizer enforces:

- failure-table sections keep table semantics (and strip stray equation tokens)
- recovered chart blocks are normalized to clean label/value rows
- cross-part leakage (table rows into unrelated parts) is removed
- chart recovery residue is removed from non-chart table sections

This is global behavior, not brief-specific patching.

## Current implementation note

If the system is still in “minimal brief core” mode (header + criteria code detection), tasks/questions are the next required step.

The target is a **task register** that preserves:

- task order
- headings
- body blocks
- page refs (where possible)

This is not a question bank. It’s a captured question paper.

## AI Recovery Layer (Local-first)

The extraction pipeline now supports an optional **AI structure recovery** pass for briefs:

- Runs after deterministic task extraction + math cleanup.
- Triggered only when task quality warnings indicate likely structure drift.
- Local-first (`AI_LOCAL_*`) with OpenAI fallback.
- Rewrites only task text/parts that pass merge safety guards.

Key env controls:

- `AI_BRIEF_STRUCTURE_RECOVERY=true|false`
- `AI_PROVIDER_GRAPH_MODE=local|hybrid|openai`
- `AI_LOCAL_GRAPH_MODEL=...`
- `AI_LOCAL_BRIEF_STRUCTURE_TIMEOUT_MS=...`

Graph/image charts:

- When chart instructions are detected but no numeric series is present in text,
  page-image chart extraction is attempted (local-first) and injected as anchored
  numeric lines near the cue.
- UI chart previews are shown only when chart-image provenance exists (image cue/recovered-image cue),
  preventing synthetic chart previews for plain text/table-only sections.

Safety:

- If AI output is invalid/low-confidence, extractor keeps deterministic output.
- Grading then applies modality compliance checks and confidence capping.

## Criteria mapping behavior (brief review UI)

Brief criteria mapping is now extraction-driven/read-only in review:

- no manual criteria checkbox override flow in UI
- lock uses detected criteria from extracted brief draft
- current-brief mode shows only brief-scope detected criteria (LO-scoped)
- display order is always `PASS -> MERIT -> DISTINCTION`

Operationally: if extraction display is wrong, fix extraction/draft; do not manually force-map criteria in UI.
