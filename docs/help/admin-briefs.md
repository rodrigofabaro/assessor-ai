# `/admin/briefs` and `/admin/briefs/[briefId]` Help

## Purpose

Manage assignment briefs, extraction quality, and criteria mapping readiness.

## `/admin/briefs` (library/workbench)

### Main actions
- browse brief versions
- run/re-run extraction
- inspect task extraction and warnings
- prepare for lock/binding

## `/admin/briefs/[briefId]` (detail)

### Main tabs (typical)
- overview
- tasks
- rubric
- versions
- IV
- criteria mapping panel

### How to use
1. Validate extracted tasks and warnings.
2. Confirm criteria mapping quality (read-only, extraction-driven).
3. Confirm rubric/IV if used.
4. Lock only when extraction and mapping are correct.

## Common issue

- High confidence but wrong rendering:
  - use extraction workbench/re-extract path
  - do not lock until task artifacts are visibly correct
