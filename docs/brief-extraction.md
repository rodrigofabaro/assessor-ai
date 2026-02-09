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
Task sub-parts are extracted consistently from:
- `a) ... b) ...`
- `i) ... ii) ...`
- `1. ... 2. ...`

## 6) Confidence + warnings
Tasks are `CLEAN` only when:
- a heading is found
- the task body is sufficiently long
- no end-matter contamination is detected

Otherwise the task is marked `HEURISTIC` with warnings (e.g., short body, missing page breaks).
