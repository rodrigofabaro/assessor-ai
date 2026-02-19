# Extraction and Grading Weakness Review

Date: 2026-02-19
Author: Codex review pass (tests + code audit)

## Test Result Baseline

All scripted extraction/grading checks passed:

- TypeScript compile check
- extraction readiness/integrity tests
- brief LO/mapping/equation tests
- grading schema/confidence/input strategy tests
- regression pack

## Findings (Highest Risk First)

## High

1. Single-pass parser fragility in noisy PDFs
- Area: briefs and specs
- Risk: OCR/footer noise can still shift LO/task boundaries in unseen formats.
- Evidence: parser relies heavily on heuristics and heading patterns.
- Recommendation: add benchmark fixtures for each awarding body layout variant and lock with snapshot tests.

2. Exclusion misuse can silently reduce grading scope
- Area: brief library criteria exclusion toggles
- Risk: accidental exclusions can lower required evidence if governance is weak.
- Existing control: confirmation prompt and hard block when all criteria excluded.
- Recommendation: add mandatory exclusion reason and audit badge in grading summary.

3. Cover-only flow can pass with weak body text
- Area: submissions extraction readiness
- Risk: acceptable by policy, but can reduce evidence richness when metadata is incomplete.
- Existing control: warnings emitted.
- Recommendation: add optional stricter policy requiring either full extraction or stronger sampled page quota for certain assignments.

## Medium

1. Confidence score still partly heuristic
- Area: grading confidence
- Risk: score can appear precise while signal quality varies by modality.
- Recommendation: surface confidence decomposition in UI by default, not only in JSON/audit.

2. Triage name detection remains probabilistic
- Area: submissions triage
- Risk: false positives/negatives on uncommon names and noisy covers.
- Recommendation: keep conservative auto-linking and add confidence meter + explicit source chips.

3. Model/config drift visibility
- Area: submission grade config and run display
- Risk: operator confusion if configured model and active model differ.
- Recommendation: show both configured and effective model with reason.

## Low

1. Documentation and UI labels not fully harmonized
- Area: help text, warnings, card labels
- Risk: training overhead for new operators.
- Recommendation: maintain one glossary and reuse terms across UI and docs.

2. Dense control surfaces in submission workspace
- Area: detail page rails/cards
- Risk: scrolling and discoverability friction.
- Recommendation: list-style compact navigation + progressive reveal panels.

## Cross-Area Observations

- Brief quality gates are correctly blocking unsafe lock actions.
- Grading correctly enforces evidence presence for achieved criteria.
- Band-cap policy protects against overgrading when merit/distinction sets are incomplete.
- Automation trigger behavior is aligned with `AUTO_READY` state.

## Priority Actions

1. Expand parser fixture matrix (brief/spec variants).
2. Add exclusion reason logging and UI trace.
3. Add confidence breakdown panel in submission detail.
4. Add stricter optional policy profile for high-stakes units.