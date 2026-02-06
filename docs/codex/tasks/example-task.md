# Task: Add brief archive banner

## Governing rules
- [NON_NEGOTIABLES](../NON_NEGOTIABLES.md)

## Context
Briefs that are archived should be obvious in the admin UI.

## Goal
Show an “Archived” badge when a brief is archived.

## Required behaviour
- Archived briefs remain queryable.
- Locked briefs are still immutable.

## Acceptance tests
- Load /admin/briefs and verify archived badge appears.

## Files to touch
- app/admin/briefs/BriefsTable.tsx

## Definition of done
- Badge renders for archived briefs.
- No changes to grading/extraction logic.
