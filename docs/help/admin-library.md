# Admin Library (`/admin/library`)

Last updated: 2026-02-19

## Purpose

Inspect and control grading scope at brief/criteria level.

## Key Controls

- criteria pills per brief
- criterion exclusion toggle (with confirmation)
- exclusion summary chip

## How To Use Exclusion Safely

1. click criterion pill
2. confirm exclusion/include action
3. verify pill state updated
4. re-run grading only if exclusion change is intended

## Warnings

- excluding criteria changes grade outcomes
- excluding all criteria blocks grading (`GRADE_NO_ACTIVE_CRITERIA`)
- always record reason in ops notes before exclusion changes