# Release Notes

Last updated: 2026-03-03

## Unreleased

1. M7 export-pack foundation:
   - added deterministic submission export-pack generation (`assessment-snapshot.json`, `feedback-summary.txt`, `summary.csv`, `marked.pdf`, `manifest.json`)
   - added replay parity verification endpoint for earlier export ids
   - wired submission-detail utilities with `Generate export pack` and `Replay parity check` actions
2. IV-AD Phase 4 API contract:
   - added `POST /api/iv-ad/review-draft` with strict request schema validation
   - added strict AI response schema enforcement for typed review draft JSON
   - added request-id aware error taxonomy + ops event logging for invalid request/provider/schema failures
   - added `scripts/iv-ad-review-draft-schema.test.js` and included it in `test:regression-pack`
3. IV-AD Phase 5 kickoff:
   - `/admin/iv-ad` now includes `Run AI IV Review` action before final DOCX generation
   - review draft sections are editable in-page (decision/feedback/criteria/integrity/comments/actions)
   - evidence snippets and warning list are rendered from the strict review-draft contract
   - final generation now accepts `reviewDraftJson` override and uses edited draft comments/actions when present
   - final generation now enforces an explicit approval gate (`reviewApproved`, `reviewApprovedBy`) before DOCX output
   - IV-AD document records now persist review draft audit snapshot + approval metadata (`reviewDraftJson`, `reviewDraftApproved*`)
   - `/admin/iv-ad` history now shows review audit status (approved/by/at, source type, warnings/evidence counts)
4. IV-AD Phase 6 kickoff:
   - submission detail now includes a `Generate IV-AD` launch action that opens `/admin/iv-ad` with prefilled context
   - `/admin/iv-ad` now accepts submission-detail query prefill for key fields, grade override, key notes, and approver default
   - launch flow now also carries `referenceSpecId` when available and shows source badges for auto-filled fields in `/admin/iv-ad`

## 1.0.1 (Maintenance)

Date: 2026-03-02  
Release Branch: `main`

### Shipped In 1.0.1

1. Brief extraction reliability:
   - hard validation guard added to block structurally invalid brief extraction outputs
   - staged retry + whole-PDF AI fallback path for unresolved brief structure defects
   - Celsius OCR artifact guard (`100 ° CC`-style) enforced in hard validation
2. Feedback integrity:
   - assessor criterion override PATCH now auto-regenerates feedback when no manual feedback text is supplied
   - final grade and feedback narrative remain aligned after overrides
3. Figure/diagram extraction controls:
   - brief figure references are validated for image token presence (`[[IMG:...]]`)
   - reference figure route available for rendering extracted brief figures
4. Performance maintenance:
   - admin overview reduced submission status count query fan-out by grouping status counts in one DB call
   - `/api/reference-documents` now defaults to lean extraction summaries and supports `extracted=none|summary|full` plus pagination (`limit`, `offset`, `includeTotal`)
5. Deployment-safety extraction/auto-grade guardrails:
   - auto-grade now requires cover metadata completeness in `COVER_ONLY` mode before `AUTO_READY`
   - auto-grade now requires locked + hard-validated brief document context (configurable strict gate)
   - submission extraction normalization now repairs common Celsius OCR artifacts (`° CC` -> `°C`) for cleaner readable text
6. Documentation/help refresh:
   - help docs updated for hard validation, fallback flow, override-feedback sync, and current screenshot set

### Validation Results (2026-03-02)

1. `node scripts/cover-metadata.test.js`: PASS
2. `node scripts/brief-hard-validation.test.js`: PASS
3. `node scripts/brief-spec-audit.test.js`: PASS
4. `node scripts/extraction-readiness.test.js`: PASS
5. `node scripts/extraction-integrity.test.js`: PASS
6. `pnpm exec tsc --noEmit --incremental false`: PASS

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
