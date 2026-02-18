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

## Mapping Health Panel

The Criteria Mapping section now shows a `Mapping Health` block after lock attempts:

- `blockers`: must be fixed before lock (unless explicitly bypassed)
- `warnings`: advisory issues
- `metrics`: selected/matched and P-M-D counts

Typical blocker example:
- `MERIT criteria detected without any DISTINCTION criteria. Extraction may be incomplete.`

## Lock Behavior (Briefs)

- Lock uses extraction-driven mapping with quality gate checks.
- If enabled by env (`REQUIRE_BRIEF_REVIEW_CONFIRM=true`), lock requires review confirmation.
- Lock can return:
  - `BRIEF_EXTRACTION_QUALITY_GATE_FAILED` (422)
  - `BRIEF_ALREADY_LOCKED` (409)
- On success, lock stores review approval metadata in `sourceMeta.reviewApproval`.

## Regrade After Mapping Changes

After changing/fixing a brief mapping, run impacted regrading from `/submissions`:

- Use `Regrade impacted`
- Input:
  - `assignmentBriefId`, or
  - `unitCode assignmentRef` (example: `4014 A2`)

## Common issue

- High confidence but wrong rendering:
  - use extraction workbench/re-extract path
  - do not lock until task artifacts are visibly correct
