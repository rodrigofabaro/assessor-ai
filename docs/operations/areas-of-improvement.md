# Areas Of Improvement

Last updated: 2026-02-18

## Current bottlenecks

1. Assignment mapping gap at intake
- Submissions can land on placeholder assignments (`unitCode + assignmentRef`) without `assignmentBriefId`.
- Impact: grading blocks with `GRADE_ASSIGNMENT_BINDING_MISSING`.

2. Auto-grade trigger timing
- Auto-grade previously ran when `assignmentId` existed, even without mapped brief.
- Impact: repeated avoidable 422 failures and noisy retries.
- Status: mitigated in code by requiring `assignment.assignmentBriefId` before auto-grade.

3. Model output reliability for structured grading
- Responses API can return invalid/incomplete grading payloads on larger criteria sets.
- Impact: schema validation failure, fallback/manual-review outcomes.

4. Output token budget under-sizing
- Fixed low `max_output_tokens` can truncate criterion-level decisions.
- Impact: partial JSON and invalid model outputs.
- Status: mitigated with criteria-count-based token floor.

5. Cover-only extraction bias
- When body text is de-emphasized, modality and criterion evidence quality drops.
- Impact: lower confidence and increased `UNCLEAR`/`NOT_ACHIEVED` decisions.
- Status: adjusted to use extracted body text as primary grading context.

6. Error observability
- Generic `GRADE_FAILED` responses made root-cause diagnosis slow.
- Impact: longer operator resolution loops.
- Status: improved. Diagnostic causes are richer and operational events are written to `.ops-events.jsonl` with API visibility (`/api/admin/ops/events`).

7. Reference coverage dependency
- If a unit has only `A1` mapped and submission is detected as `A2`, grading cannot proceed.
- Impact: valid student submissions remain blocked until reference coverage is completed.
- Status: partially mitigated. Mapping quality gate blocks bad lock state, and impacted submissions can be bulk regraded after mapping fixes.

8. Mapping drift between extracted brief criteria and locked mapping
- Drift can happen after manual edits/re-extract or noisy extraction artifacts.
- Impact: grading on stale/incorrect criteria sets.
- Status: mitigated with:
  - brief lock quality gate
  - grading-time mismatch guard (`GRADE_CRITERIA_MAPPING_MISMATCH`)
  - drift report endpoint: `/api/admin/ops/mapping-drift`

## Priority actions

1. Ensure all active assignment refs (`A1`, `A2`, etc.) are extracted, locked, and mapped before live intake.
2. Keep auto-grade gating strict (`student + assignment + mapped brief + extraction ready`).
3. Run scheduled drift checks (`pnpm run ops:mapping-drift`) and regression pack (`pnpm run test:regression-pack`) before release.
4. Enable `REQUIRE_BRIEF_REVIEW_CONFIRM=true` and `ENFORCE_ADMIN_MUTATIONS=true` in production.
5. Monitor `/api/admin/ops/metrics` and define SLO thresholds for extraction success/failure trends.
