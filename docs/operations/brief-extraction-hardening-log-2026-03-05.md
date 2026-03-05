# Brief Extraction Hardening Log (2026-03-05)

Last updated: 2026-03-05
Owner: Engineering
Status: Active hardening during deployment

## Why this document exists

We keep fighting extraction quality across different briefs. This document records:
- what we have implemented so far,
- where failures keep happening,
- what was fixed in the latest hardening pass,
- what is still open before production extraction can be trusted.

This is intentionally practical and focused on operational truth, not ideal architecture.

## Current extraction architecture

1. Document intake
- Upload PDF/DOCX.
- Persist file path and metadata.

2. Native extraction
- Page/text extraction.
- Brief parser builds `header`, `tasks`, `parts`, `criteria`, `LO`, warnings.
- Symbol/math normalization and draft sanitization run before save.

3. Validation and recovery
- Hard validation checks extraction integrity.
- Re-attempts run with stronger recovery settings.
- Whole-PDF OpenAI fallback can run to recover structure when native parse is weak.

4. UI review
- Brief review shows warnings/readiness.
- Task card can show table rendering and chart recovery controls.
- Manual override exists for operator correction.

## What has been implemented so far

## Parser and normalization work

- Header extraction with ambiguity warnings.
- Task and part segmentation with hierarchy normalization.
- Equation token cleanup and false-positive suppression.
- Image cue detection and token injection (`[[IMG:...]]`).
- Table detection and HTML rendering for structured blocks.
- Draft integrity sanitization before persistence.

## Guardrails and gates

- Hard validation for BRIEF extractions.
- Retry loop with candidate scoring.
- Optional/automatic whole-PDF fallback recovery.
- Lock-state safety rules around re-extract behavior.

## Operational tooling

- Warning/readiness panel in the brief admin view.
- Re-extract controls and manual override workflows.
- Regression/readiness scripts for extraction quality checks.

## Recurring difficulties we keep hitting

## 1) PDF variability is the root problem

- Different templates and PDF generators produce very different text flow.
- Line wraps, hidden spacing, and page headers break deterministic parsing.
- Some PDFs have weak page-break signals, making page attribution unreliable.

Impact:
- Task boundaries drift.
- Part keys become ambiguous.
- Section contamination (end-matter leaking into task text).

## 2) Image-heavy tasks cannot be solved by text parsing alone

- Graphs/diagrams in images often have no usable numeric text in extraction.
- Native parser can detect cue words, but values still require image understanding.

Impact:
- Missing chart data.
- “Looks extracted” but semantically incomplete task output.

## 3) Small tables are fragile

- Compact two-column tables often flatten into prose lines.
- OCR/text extraction can drop delimiters.

Impact:
- Table not rendered as HTML.
- Numeric rows appear as plain text and reduce assessor trust.

## 4) Validation false positives created noise

- Scenario warnings fired on briefs that do not define scenario blocks.
- Duplicate part warnings fired when contextual keys were actually valid (`a.1`, `b.1`).

Impact:
- Review panel looked “broken” even when extraction was usable.
- Operators lost confidence in warnings.

## 5) Recovery path was not always aggressive enough

- Earlier behavior could wait for hard-fail before using strongest fallback.

Impact:
- Some briefs stayed in weak extraction modes longer than acceptable for deployment.

## What was fixed in the latest hardening pass (2026-03-05)

1. Scenario warning correctness
- Scenario-mapping warnings now trigger only when scenario signal exists in the brief.
- Result: no false “missing scenario” warnings for scenario-less briefs.

2. Duplicate part-key normalization
- Validation now normalizes contextual part keys before duplicate detection.
- Result: valid structures no longer flagged as duplicates.

3. Graph/figure cue coverage expanded
- Broader cue vocabulary for figure/graph/chart references.
- Better token insertion and better chance to trigger chart recovery paths.

4. Small-table handling improved
- Added two-column numeric row support.
- Added explicit support for “Failure Reason / Number of Chips”-type headers.
- Result: more correct HTML table rendering for compact tables.

5. Whole-PDF recovery mode introduced as policy
- Recovery mode now supports `OFF`, `ON_FAIL`, `ALWAYS`.
- Deployment default is set to prioritize reliability (`ALWAYS`) unless overridden.

## Remaining gaps before we can call extraction production-grade

1. Display fidelity is not yet cryptographically grounded
- We still need strict provenance per displayed block:
  - source page,
  - source snippet,
  - confidence state.

2. No strict “fidelity report” gate yet
- We need an extraction-vs-source verifier that outputs explicit mismatches:
  - missing content,
  - hallucinated content,
  - structural mismatch.

3. Benchmark coverage is still too narrow
- We need a fixed benchmark pack of briefs (easy/medium/hard variants) and stable KPIs.

4. Image chart recovery still has edge failures
- Some graph cases still need manual recovery and human check.

## Operational policy recommendation (short term)

Until fidelity gate is completed:

1. Treat extraction warnings as operator actions, not noise.
2. Keep whole-PDF recovery enabled for BRIEFs in deployment hardening.
3. Require manual review confirmation before final lock.
4. Track every failed extraction with root-cause tag (parser, PDF quality, chart image, table layout, other).

## Next implementation block

1. Add fidelity report object to extraction payload.
2. Add source-provenance badges/links in the brief review UI.
3. Add lock blocker when unresolved fidelity mismatches remain.
4. Add benchmark dashboard with pass/fail trend over time.

## Quick reality summary

The extraction system is now materially stronger than earlier iterations, but the fight is real because PDF layout variability is real. We have improved parser resilience, warning correctness, and fallback aggressiveness. The next step is not another heuristic burst; it is a strict fidelity gate that proves the displayed structure matches source evidence before lock.
