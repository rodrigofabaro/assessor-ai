# Assessor-AI Unified Roadmap

Last updated: 2026-03-03

## Purpose

Single source for:
1. What is next
2. What to implement
3. How to deploy
4. What defines done

Use this doc when the instruction is: "continue the roadmap".

## Current status snapshot

1. Completed baseline milestones: M1-M6
2. Active delivery target: M7 (Export packs)
3. Parallel tracks in preparation:
   - IV-AD AI review rollout
   - M8 deployment readiness
   - M9 auth and UX hardening foundation

## Execution lanes

### Now (in progress)

1. M7 export-pack endpoint/UI
- one-click export bundle per submission
- deterministic manifest and checksums
- replay route with parity validation

Implementation note (2026-03-03):
- submission-detail UI now generates export packs and runs replay parity checks
- API routes added for export generation, replay verification, and per-file download

2. Extraction and admin performance hardening
- brief extraction regression stabilization
- reference inbox pagination/projection optimization
- submission detail heavy-panel render optimization

3. QA reliability instrumentation
- preview/commit/regrade latency metrics
- p50/p95 + retry/failure dashboard cards

### Next (immediately after current queue)

1. IV-AD Phase 4
- `POST /api/iv-ad/review-draft`
- strict request/response schema
- structured error taxonomy and request-id logging

2. IV-AD Phase 5
- `Run AI IV Review` action in `/admin/iv-ad`
- editable draft sections
- evidence snippet panel
- manual fallback preserved

3. M8 Phase A groundwork
- production env contract
- storage/data migration plan
- pre-deploy smoke checklist

4. M9 auth foundation spike
- auth/session approach selection
- route protection matrix (`Admin`, `Assessor`, `IV`)
- non-breaking rollout path
- Progress (2026-03-03): foundation scaffold added.
- Canonical matrix: `docs/operations/auth-role-matrix.md`.
- Feature-flagged middleware (`AUTH_GUARDS_ENABLED`) added with non-breaking default (`false`).

### Later

1. Full M8 production deployment and cost-ladder scaling
2. Full M9 auth + UX template rollout + final performance hardening

## Definition of done by active queue

### Queue A - M7 closure

Done when:
1. Export pack is deterministic and reproducible
2. Replay parity check passes on same export id
3. Release notes include shipped behavior and validation evidence

Progress (2026-03-03):
1. Deterministic export generation and replay parity routes are implemented.
2. Operator validation script added: `scripts/export-pack-validation.test.js` (manifest required files + checksum integrity).
3. Validation script is included in `test:regression-pack`.
4. Live evidence command added: `pnpm run ops:export-pack-evidence` (generates export, runs replay parity, writes `docs/evidence/export-pack/*.json`).
5. Live evidence captured (2026-03-03): `docs/evidence/export-pack/20260303-130826-0226534f-6796-431b-9978-04c32783748a-97e0d665a279f806737d.json`.

### Queue B - IV-AD Phase 4/5 start

Done when:
1. Review-draft endpoint is merged and test-covered
   - Status (2026-03-03): `POST /api/iv-ad/review-draft` added with strict request/response schema validation and request-id + ops-event logging.
2. `/admin/iv-ad` can generate editable AI draft
   - Status (2026-03-03): in progress. Added `Run AI IV Review` action in `/admin/iv-ad`, editable draft sections backed by `/api/iv-ad/review-draft`, `reviewDraftJson` handoff into final DOCX generation, mandatory approval gate before generation, and approval/audit metadata visibility in IV-AD history.
3. Manual completion still works when AI draft fails

### Queue B.1 - IV-AD Phase 6 start

Progress (2026-03-03):
1. Added `Generate IV-AD` launch action from submission detail.
2. Added first-pass prefill handoff into `/admin/iv-ad` via query parameters (student/unit/assignment/assessor/IV, grade, key notes).
3. Added source badges in `/admin/iv-ad` for auto-filled fields and SPEC preselection when reference context is available.
4. Added missing-context fallback in `/admin/iv-ad` (`Missing context` badges + manual completion prompt list).

### Queue B.2 - IV-AD Phase 7 start

Progress (2026-03-03):
1. Added IV-AD audit detail endpoint (`GET /api/admin/iv-ad/documents/[documentId]`).
2. Added `View audit` modal in `/admin/iv-ad` history for persisted review snapshot and approval inspection.
3. Added history filters in `/admin/iv-ad` (approval state + source type).
4. Added history date-range filter (`From`/`To`) and CSV export of the current filtered result set.

### Queue C - Deployment readiness

Done when:
1. Deployment preflight checklist is executable end-to-end
2. Data/file migration plan is documented with rollback path
3. Smoke checks are scripted and repeatable

Progress (2026-03-03):
1. Environment contract is now canonicalized in `docs/operations/environment-contract.md`.
2. Runtime startup validation is implemented in `lib/runtimeEnvContract.ts` and invoked by `app/layout.tsx` and `lib/prisma.ts`.
3. Contract currently hard-fails on missing `DATABASE_URL`; OpenAI credential is warning by default and can be promoted to hard-fail with `ENV_CONTRACT_REQUIRE_OPENAI=true`.
4. Storage migration + rollback runbook is now documented in `docs/operations/storage-migration-rollback.md` (backup, restore, verification, rollback triggers, evidence).
5. One-command deploy smoke is implemented: `pnpm run ops:deploy-smoke` (`scripts/deploy-smoke-evidence.js`) with evidence output in `docs/evidence/deploy-smoke/`.
6. Deploy smoke evidence captured (2026-03-03): `docs/evidence/deploy-smoke/20260303-140208.json`.
7. Release gate command added: `pnpm run ops:release-gate` with evidence output in `docs/evidence/release-gate/`.
8. Release gate evidence captured (2026-03-03): `docs/evidence/release-gate/20260303-142551.json` (includes deploy-smoke pass in same run).

## Production deployment steps (single runbook section)

### Pre-deploy

1. Confirm tooling:
- `node -v`
- `pnpm -v`

2. Run quality gates:
- `pnpm run ops:release-gate` (single mandatory gate command; includes tsc, regression pack, export-pack validation, deploy smoke)

3. Verify environment contract:
- `DATABASE_URL`
- OpenAI keys/config
- Turnitin config (if enabled)
- app runtime envs for extraction/grading automation

4. Confirm backup/rollback readiness:
- DB backup point created
- file storage snapshot/sync plan ready
- runbook: `docs/operations/storage-migration-rollback.md`

### Deploy

1. Install and generate:
- `pnpm install`
- `pnpm prisma generate`

2. Apply schema:
- `pnpm prisma migrate deploy`

3. Start app:
- `pnpm run build`
- `pnpm start` (or platform equivalent)

### Post-deploy smoke checks

1. Run `pnpm run ops:deploy-smoke` and verify PASS evidence artifact in `docs/evidence/deploy-smoke/`
2. Reference/spec/brief lock routes work
3. QA preview/commit works
4. IV-AD generation path works
5. `/api/admin/ops/metrics` and event logs are healthy

### Rollback

1. Trigger rollback on P1 functional break or data integrity risk
2. Revert app to previous release artifact/commit
3. Restore DB/files from pre-deploy checkpoint if needed
4. Re-run smoke checks before reopening traffic

## Change discipline (required)

For every roadmap continuation batch:
1. Update this file first
2. Implement code changes
3. Update `RELEASE_NOTES.md`
4. Update affected help/ops docs
5. Mark queue items done only with verifiable evidence
6. Keep `docs/SCOPE_AND_DOD.md` and `docs/KNOWN_LIMITATIONS.md` current.

## Operator prompt contract

When asked: "continue the roadmap"

Default action order:
1. Read this file
2. Pick next unfinished item from `Now`, then `Next`
3. Implement
4. Validate with tests/smoke checks
5. Update docs and status in this file
