# Operating Model (2026-03-04)

## Day-to-day

1. `Submissions` is the primary lane for tutors/assessors.
2. `Admin > Specs` and `Admin > Briefs` are governance lanes (lock/version control).
3. `Admin > QA` is used for flagged/edge-case review.

## Framework onboarding

1. Upload framework source files (SPEC/BRIEF) with:
   - `framework` (for source family/version)
   - `category` (for domain grouping, e.g. Engineering)
2. Extract and lock.
3. Use catalog compare to review units with matching family/category.

## One-time full suite import

1. Run:

```bash
pnpm run ops:spec-suite-import-once
```

2. Validate in `Admin > Specs`:
   - expected unit coverage
   - lock status
   - no extraction failures

## Release operation

1. Run release gate:

```bash
pnpm run ops:release-gate
```

2. Deploy.
3. Run smoke evidence:

```bash
pnpm run ops:deploy-smoke
```

4. Save evidence artifact from `docs/evidence/deploy-smoke/`.
