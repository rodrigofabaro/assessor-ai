# Release Notes

## 1.0.0 (Completed)

Date: 2026-02-20  
Release Branch: `main`

### Shipped In 1.0.0

1. Submission detail workspace hardening:
   - run history sync and commit-grade run selection
   - feedback history expand/collapse
   - notes navigator pinned bottom-right
2. Grading reliability hardening:
   - global contradiction guard for criterion decisions
   - brief-specific M2 policy guard for 4004 A1
   - decision drift telemetry across re-grades
3. Assessor override workflow:
   - criterion-level override + reason code + note
   - effective-grade recomputation and output regeneration
4. QA and operations:
   - QA flags/reasons and override breakdown surfaces
   - ops playbook help page and upload quick-link
5. Performance pass:
   - lean submissions API modes
   - DB indexes for high-frequency list/latest-run paths
   - server-side pagination and filtering (workspace and QA)
6. Release governance:
   - footer moved to `1.0.0` completed defaults
   - release scope contract in `RELEASE.md`
   - reproducible runbook in `docs/ops-checklist.md`

### Updates (Post-Payload Notes)

1. Local build can hit intermittent `.next/trace` lock on Windows during repeated runs.
2. Git credential flows may fail in restricted terminal contexts and require system-level credential path.

### Reference Snapshot

1. Grading blocks if brief/spec locks are missing (`GRADE_BRIEF_NOT_LOCKED`, `GRADE_SPEC_NOT_LOCKED`).
2. Each assessment stores `referenceContextSnapshot` including:
   - unit lock metadata
   - spec document id/version/lock timestamp
   - brief id/assignment code/brief document lock timestamp
   - mapped vs extracted criteria alignment snapshot.

### Validation Results

1. `pnpm exec tsc --noEmit`: PASS
2. `pnpm run build`: PASS (with occasional local `.next/trace` lock retries on Windows)
3. Core regression scripts used in release cycle:
   - `pnpm run test:tasks-tab`
   - `pnpm run test:ai-fallback`
   - `pnpm run test:word-math`
   - `pnpm run test:grading-schema`
   - `pnpm run test:extraction-readiness`
   - `pnpm run test:extraction-integrity`
   - `pnpm run test:brief-readiness`

### Known Blockers And Mitigations

1. Git credential/auth failures in some terminal contexts.
   - Mitigation: use system Git credential manager flow and retry `git push` outside restricted sandbox context.
2. `.next/trace` file lock during repeated local builds.
   - Mitigation:
     - `Remove-Item .next\\trace -Force -ErrorAction SilentlyContinue`
     - rerun `pnpm run build`

### Rollback

If rollback is required, return `main` to commit `de368c3` (pre-1.0 release docs/footer bump/perf rollout), then redeploy and run smoke checks on `/submissions`, `/submissions/[submissionId]`, `/admin/qa`, and `/admin/settings`.
