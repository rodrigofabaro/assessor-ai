# Submission Grading Runbook

Date: 2026-02-19

## Objective

Process submissions from extraction to defensible grading with minimal manual friction.

## Required Controls

- references extracted and locked
- brief mapping quality gate passed
- submission extraction gate passed
- auto grading enabled if desired

## Run Sequence

1. upload submission
2. extraction runs
3. triage resolves links
4. automation state evaluated
5. auto grading fires when `AUTO_READY` (or operator runs manual grade)
6. assessment saved with full audit payload
7. marked PDF generated

## When Manual Review Is Mandatory

- extraction blockers or OCR required
- mapping mismatch
- missing critical modality evidence for required task sections
- ambiguous criterion evidence

## Pre-Release Check

Run full extraction/grading scripted test suite before deploying pipeline changes.