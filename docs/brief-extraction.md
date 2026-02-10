# Brief extraction process (UniCourse/Pearson briefs)

This document summarizes the deterministic brief extraction flow used for assignment briefs.

## 1) Page-aware PDF extraction
- PDFs are rendered per page using `pdf-parse` with a custom `pagerender`.
- Pages are joined with `\f` so `splitPages()` can reliably map page numbers.
- `pageCount` and `hasFormFeedBreaks` are attached to extracted JSON for audit/debug.

## 2) Page normalization
- Each page is split into lines, footers are removed, and whitespace is normalized **per line**.
- Line boundaries are preserved so headings and task bodies remain structured.

## 3) End-matter detection
Primary anchors (start of end-matter):
- `Sources of information`
- `Relevant Learning Outcomes and Assessment Criteria`

Secondary headings (`Textbooks`, `Websites`, `Further reading`, etc.) only start end-matter if:
- the line is heading-like (short, no sentence punctuation), or
- it appears within a small window after a primary anchor, or
- the parser has already entered the sources block.

This avoids stopping task extraction prematurely when “textbooks” appears in task instructions.

## 4) Task heading detection
Supported heading patterns:
- `Task 1`
- `Task 1: ...`
- `Task 1 Activity – ...`
- `Task` on one line + `1` on the next line
- Optional bullet/stray characters before “Task”

If multiple headings match the same task number, the best candidate is chosen by score:
- +10 if a title is present
- +5 if it contains `Activity`
- +2 if it includes `:`, `–`, or `-` followed by text

The chosen heading is used to slice the task body until the next chosen heading (or end-matter).

## 5) Task parts
Task sub-parts are extracted consistently from top-level labels at the start of a line:
- `a) ... b) ...`
- `a. ... b. ...`
- `i) ... ii) ...`
- `i. ... ii. ...`
- `1. ... 2. ...`

Rules:
- Top-level letter labels are only recognized at line start (after optional leading spaces).
- A part only starts when the parser sees a fresh top-level marker (not nested bullets/continuations).
- Nested roman numerals are namespaced under their parent where applicable (e.g. `a.i`, `a.ii`, `b.i`).
- The UI renders the stored key directly (no index-to-letter remapping), preventing duplicate display labels.

## 6) Structured table extraction
The extractor supports task-local structured table capture:

- `task.tables[]` holds semantic tables with `id`, `title`, `columns`, `rows`, and confidence.
- Known anchored tables (e.g., `Table 2.1`) use targeted heuristics to reconstruct headers/rows.
- Costing template tables can be emitted as template rows with blank numeric cells when the PDF border geometry is unreliable.

De-duplication behavior:
- Once a table is extracted, the source table lines are removed from `task.text` and replaced with placeholders like `[TABLE: table-2.1]`.
- This ensures the UI does not show both flattened noise and a rendered table.

## 7) Formula + matrix extraction
For briefs containing formula-heavy content, the extractor emits `task.formulas[]` blocks:

- `kind: "equation"` for equation-like lines.
- `kind: "matrix"` for matrix blocks detected as a named assignment (e.g. `D =`) followed by aligned numeric rows.

Math cleanup:
- Common extraction artifacts are normalized to reduce replacement-character (`�`) noise.
- When a matrix is captured, the raw broken lines are replaced with a placeholder marker in task text.

The UI renders:
- equations in monospace preformatted blocks,
- matrices as compact bordered mini-grids.

## 8) Confidence + warnings
Tasks are `CLEAN` only when:
- a heading is found
- the task body is sufficiently long
- no end-matter contamination is detected

Otherwise the task is marked `HEURISTIC` with warnings (e.g., short body, missing page breaks).
