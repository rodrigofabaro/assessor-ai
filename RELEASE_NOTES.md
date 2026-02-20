# Release Notes

Date: 2026-02-18  
Branch: `release/project-finish`

## Update: 2026-02-20 (main)

### Navigation + Performance

- Added lazy-loaded route wrappers for heavy pages:
  - `/submissions/[submissionId]` via `SubmissionDetailClient`
  - `/admin/settings` via `SettingsPageClient`
- Updated internal submissions navigation to use client routing where applicable.

### Submissions Workspace UX

- Consolidated duplicate upload entrypoints into one primary action.
- Renamed CTA to `Upload assignment`.
- Simplified batch actions:
  - kept `Grade auto-ready` as primary visible action
  - moved secondary actions into `Batch actions` menu

### Landing-Page Icon Pass

- Added lightweight inline icon enhancements to landing-style surfaces:
  - admin overview
  - help topic sidebar

### Documentation Sync

- Updated root and operations/help docs for current UI labels and flow.

## Update: 2026-02-20 (grading reliability + workspace UX)

### Submission Workspace

- Feedback Summary History now supports per-run `Expand/Collapse` to read full historical feedback.
- Notes navigator is fixed to bottom-right of the PDF viewport.
- After `Commit grade`, the workspace now re-selects the latest assessment run so the grade badge and feedback editor stay in sync.

### Notes Generation + Rendering

- Reworked student page-note wording to be more natural and action-oriented:
  - avoid repetitive templates and placeholder fragments
  - produce concise evidence + next-step guidance
  - remove noisy ellipsis artifacts
- Marked PDF note placement now renders at bottom-right of each page (not vertically centered).

### Grading Policy Hardening

- Added brief-specific decision guard for Unit `4004` Assignment `A1`:
  - Criterion `M2` cannot remain `ACHIEVED` unless evidence/rationale shows:
    - an alternative milestone monitoring method, and
    - explicit justification/comparison for chosen method.
- Guard decisions are captured in `systemNotes` for audit traceability.

### Robust Grading Next Steps (recommended)

- Add criterion-level calibration sets (gold-standard exemplars and borderline cases) and run them on every model/prompt change.
- Add deterministic post-decision guards for all high-dispute criteria (not only M2) using brief metadata.
- Enforce evidence-coverage thresholds per criterion (minimum citation count + page spread + rationale quality checks).
- Add disagreement workflow:
  - assessor override with reason code
  - structured disagreement capture
  - replay queue for prompt/policy tuning.
- Add run-to-run drift monitor that blocks automatic promotion when criterion decisions swing without new evidence.
- Add extraction-quality gates per modality (tables/charts/equations/images) with targeted penalties and explicit warnings.

## Included Commits

- `2b9f2a2` docs: polish admin help and add project completion checklist
- `b9c7c3c` style(ui): finish sky-accent consistency on remaining workflows
- `595f73b` style(ui): unify primary actions and interaction tokens across app
- `fd42054` chore(lint): resolve help and submission unused/effect warnings
- `abf5637` style(admin): standardize template and color scheme across top-level pages

## What Shipped

- Admin UI standardized across top-level pages and key deeper workflows.
- App-wide primary action styling unified (sky accent) across major routes and shared components.
- Help/admin docs updated for current operations model.
- Lint blockers resolved in help/submission code.
- Project completion checklist added: `docs/PROJECT_COMPLETION_CHECKLIST.md`.

## Validation Results

- `pnpm lint`: PASS
- `pnpm exec tsc --noEmit --incremental false`: PASS
- `pnpm run test:tasks-tab`: PASS
- `pnpm run test:ai-fallback`: PASS
- `pnpm run test:word-math`: PASS
- `pnpm run test:grading-schema`: PASS
- `pnpm run test:extraction-readiness`: PASS
- `pnpm run test:extraction-integrity`: PASS
- `pnpm run test:brief-readiness`: PASS

## Known Operational Blockers

- Git push from this machine is blocked by credentials:
  - `SEC_E_NO_CREDENTIALS (0x8009030E)`
- `pnpm run build` was not consistently confirmable in-session due local `.next/trace` lock/timeouts.

## Deploy Runbook

1. Restore GitHub auth on machine.
2. Push branch:
   - `git push origin release/project-finish`
3. Run pre-deploy checks:
   - `pnpm lint`
   - `pnpm exec tsc --noEmit --incremental false`
   - `pnpm run test:tasks-tab`
   - `pnpm run test:ai-fallback`
   - `pnpm run test:word-math`
   - `pnpm run test:grading-schema`
   - `pnpm run test:extraction-readiness`
   - `pnpm run test:extraction-integrity`
   - `pnpm run test:brief-readiness`
4. Run production build in clean session:
   - `Remove-Item .next\\trace -Force -ErrorAction SilentlyContinue`
   - `pnpm run build`
5. Deploy and smoke-test key routes:
   - `/`
   - `/upload`
   - `/submissions`
   - `/submissions/[submissionId]`
   - `/admin`
   - `/admin/qa`
   - `/admin/audit`
   - `/admin/reference`
   - `/admin/settings`
