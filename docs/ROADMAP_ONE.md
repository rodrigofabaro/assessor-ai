# Assessor-AI Unified Roadmap

Last updated: 2026-03-05

## Purpose

Single source for:
1. What is next
2. What to implement
3. How to deploy
4. What defines done

Use this doc when the instruction is: "continue the roadmap".

## Current status snapshot

1. Completed baseline milestones: M1-M6
2. Active delivery target: M8 (post-go-live deployment hardening)
3. Parallel tracks in preparation:
   - IV-AD AI review rollout hardening
   - M8 production hardening execution
   - M9 auth and UX hardening foundation
   - M10 multi-organization tenant isolation (super admin + org memberships + org settings)
4. Production recovery update (2026-03-04):
   - normal login path recovered
   - temporary emergency auth removed
   - deploy-smoke still blocked at upload `create_submission`
   - storage target locations are not configured yet
5. Today priority update (2026-03-05):
   - P0: set/fix production storage deployment targets and unblock upload deploy-smoke
   - P0: enable password recovery email flow (no manual recovery path)

## Execution lanes

### Now (in progress)

1. P0 M8 storage deployment finalization (today)
- define production storage target location/credentials and set runtime envs
- finalize `FILE_STORAGE_ROOT` strategy per environment (Local/Preview/Production)
- verify upload create path in production (`/api/submissions/upload`) passes consistently
- capture fresh deploy-smoke PASS evidence after storage target is set
- Progress (2026-03-05): storage deployment contract gate in progress.
- Added deploy gate contract command: `pnpm run ops:storage-contract`.
- Release gate now includes storage deployment contract check before deploy smoke.
- Added strict enforcement flag for cutover environments: `ENV_CONTRACT_REQUIRE_STORAGE_ROOT=true`.
- Remaining action: set durable storage root per runtime and capture fresh production deploy-smoke PASS evidence.

2. P0 M9 password recovery email enablement (today)
- enable transactional email provider for password recovery path (not `mailto` fallback)
- implement/verify password recovery email flow for locked users
- required envs: `AUTH_INVITE_EMAIL_PROVIDER`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`
- add operational check for recovery-email delivery in release gate/runbook
- Progress (2026-03-05): password recovery flow implementation delivered.
- Added `POST /api/auth/password-recovery`:
  - accepts username/email and normalizes to login email
  - generates temporary password, sets `mustResetPassword=true`, and sends recovery email
  - rolls credentials back if delivery fails to avoid silent account lock-out
- Login screen now includes `Forgot password?` flow wired to recovery endpoint.
- Added deploy gate contract command: `pnpm run ops:password-recovery-contract`.
- Release gate now includes password-recovery email contract check.
- Remaining action: configure production provider and set `AUTH_REQUIRE_RECOVERY_EMAIL=true` for hard enforcement.

3. M8 first production deployment blocker removal
- replace direct local filesystem dependency with storage provider abstraction
- migrate highest-risk write/read paths first (`submissions`, `reference documents`, export artifacts)
- keep backward-compatible resolver for existing local `storagePath` values
- Progress (2026-03-03): slice 1 completed.
- Added `lib/storage/provider.ts` and migrated:
  - `POST /api/submissions/upload`
  - `GET /api/submissions/[submissionId]/file`
  - `GET /api/submissions/[submissionId]/marked-file`
  - `POST /api/reference-documents`
  - `POST /api/briefs/[briefId]/rubric`
  - `POST /api/briefs/[briefId]/iv/[ivId]/attachment`
  - export-pack writes/replay reads in `lib/submissions/exportPack.ts`
  - marked PDF and IV-AD storage writers (`lib/grading/markedPdf.ts`, `lib/iv-ad/storage.ts`)
- Added `FILE_STORAGE_ROOT` env override for path migration control.
- Progress (2026-03-03): slice 2 completed.
- Additional provider resolution applied to:
  - `lib/extraction.ts` (`extractFile`)
  - `/api/submissions/[submissionId]/grade` raw-PDF page render path
  - `/api/reference-documents/[documentId]/figure` cache write path (`storage/reference_images/*`)
- Progress (2026-03-03): slice 3 completed.
- IV-AD routes now use provider-based storage resolution for read paths:
  - `/api/iv-ad/review-draft`
  - `/api/admin/iv-ad/documents/[documentId]/file`
  - `/api/admin/iv-ad/generate`
  - `/api/admin/iv-ad/generate-from-submission`
- Added explicit unresolved-path errors for template/marked-PDF reads.
- Deploy smoke evidence after slice 3: `docs/evidence/deploy-smoke/20260303-170308.json`.
- Progress (2026-03-03): persistence sweep completed.
- Canonical classification added: `docs/operations/persistence-classification.md`.
- Remaining `must-migrate` blockers before production-safe go-live:
  - file-backed runtime settings/state (`.turnitin-config.json`, `.turnitin-submission-state.json`, `.automation-policy.json`)
  - runtime favicon mutation path writing into `public/favicon.ico`
- Progress (2026-03-03): first `must-migrate` item delivered.
- Ops events now write/read from DB (`OpsRuntimeEvent`) with temporary file fallback (`.ops-events.jsonl`) for safe transition.
- Compatibility hardening added: if DB model/migration is not yet available in a running environment, ops events auto-fallback to file sink instead of throwing runtime errors.
- Deploy smoke evidence after this hardening: `docs/evidence/deploy-smoke/20260303-171515.json`.
- Progress (2026-03-03): second `must-migrate` item delivered.
- Settings audit now writes/reads from DB (`AdminSettingsAuditEvent`) with temporary file fallback (`.settings-audit.json`) for safe transition.
- Progress (2026-03-03): third `must-migrate` item delivered.
- OpenAI usage telemetry now writes/reads from DB (`OpenAiUsageEvent`) with temporary file fallback (`.openai-usage-log.jsonl`) for safe transition.
- Deploy smoke evidence after this slice: `docs/evidence/deploy-smoke/20260303-172205.json`.
- Progress (2026-03-03): fourth and fifth `must-migrate` items delivered.
- Grading config now persists via DB (`AppConfig.gradingConfig`) with runtime cache hydration + file fallback.
- OpenAI model config now persists via DB (`AppConfig.openaiModelConfig`) with runtime cache hydration + file fallback.
- Deploy smoke evidence after this slice: `docs/evidence/deploy-smoke/20260303-172621.json`.

4. Extraction and admin performance hardening
- brief extraction regression stabilization
- reference inbox pagination/projection optimization
- submission detail heavy-panel render optimization

5. QA reliability instrumentation
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
- Cookie role bridge added: `/api/auth/role-sync` + layout `AuthRoleSync` to populate `assessor_role` when guards are enabled.
- Session-backed identity scaffold added: `/api/auth/session/bootstrap` + signed `assessor_session` cookie (`AUTH_SESSION_SECRET`) used by middleware.
- Staging-only guard validation command added: `pnpm run ops:auth-guard-smoke` (kept outside default `ops:release-gate` until enforcement rollout).

5. M10 multi-organization foundation
- add global user + organization membership model (one user in multiple organizations)
- add `SUPER_ADMIN` platform role and `ORG_ADMIN` organization role contract
- add active-organization switch flow and scoped session enforcement
- add org settings + secret storage foundations (API keys/integrations per organization)
- keep backward compatibility during migration from single `organizationId` user model

### Later

1. Full M8 production deployment and cost-ladder scaling
2. Full M9 auth + UX template rollout + final performance hardening
3. Email delivery activation for credential invites (deferred by operator)
- Keep current mode: generated password + copy + `mailto` draft in `Admin -> Users`.
- Enable when ready:
  - `AUTH_INVITE_EMAIL_PROVIDER=resend`
  - `RESEND_API_KEY`
  - `AUTH_EMAIL_FROM` (verified sender, e.g. `Assessor AI <no-reply@assessor-ai.co.uk>`)
  - optional: `AUTH_INVITE_EMAIL_DEFAULT_ON=true`

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

### Queue D - M10 multi-organization foundation

Done when:
1. `OrganizationMembership` is live and backfilled from legacy user org assignments
2. login/session resolves active organization from membership and supports organization switching
3. tenant-owned APIs are org-scoped by active session organization
4. platform and org role boundaries are enforceable (`SUPER_ADMIN` vs `ORG_ADMIN`)
5. organization settings/secrets persistence exists with audit-safe update path

## Production deployment steps (single runbook section)

Canonical environment model:
1. `docs/operations/deployment-environment-map.md` (Local vs Preview vs Production, Git->Vercel promotion flow, DB/storage separation policy)
2. Pre-merge gate command: `pnpm run ops:prepush-prod` (enforces git policy + local quality checks before merging to `main`)

## What is still missing before first Vercel deploy (as of 2026-03-03)
## What is still missing for deployment hardening (as of 2026-03-04)

Already completed:
1. Vercel production deployment is live (`www.assessor-ai.co.uk`).
2. Production PostgreSQL is connected and migrations are being applied.
3. Auth guards and session login are live in production.
4. Baseline assignment + locked brief seed was created for smoke path (`4017/A1`).

Still missing (highest impact first):
1. Durable object storage backend for production runtime files.
- Current storage provider still writes to local filesystem paths (`uploads/`, `reference_uploads/`, `storage/*`, `submission_marked/*`).
- On serverless/runtime restarts this is not durable.
- Operator-confirmed status (2026-03-04): storage places are not set yet in production.
- Required next action: define and configure production storage target credentials/paths before marking M8 hardening complete.

2. Environment separation cleanup.
- Preview/Development/Production currently share the same DB credential group in Vercel.
- Must split DB/storage credentials by environment to avoid cross-environment data risk.

3. OpenAI production key scope for grading/extraction.
- Current deploy smoke now reaches grade model execution, but fails with `GRADE_FAILED` due missing OpenAI scope: `api.responses.write`.
- Update production OpenAI key to a project key with Responses API write permission (or swap to an unrestricted key).
- Latest blocker evidence: `docs/evidence/deploy-smoke/20260304-124517.json`.

4. Upload creation blocker in production deploy-smoke.
- Current failure: `UPLOAD_FAILED` (`Upload failed at create_submission`).
- Latest evidence artifacts:
  - `docs/evidence/deploy-smoke/20260304-231125.json`
  - `docs/evidence/deploy-smoke/20260304-231234.json`
- Required next action: align production submission schema and storage/runtime config so upload create path passes consistently.

5. Post-deploy smoke evidence on each production rollout.
- Keep `pnpm run ops:deploy-smoke` evidence artifact per release and link in release notes.

6. Backup/restore operational drill evidence.
- Run one explicit restore simulation following `docs/operations/storage-migration-rollback.md`.
- Store drill evidence under `docs/evidence/`.

7. Password recovery email delivery enablement (now prioritized).
- Status (2026-03-05): API + login UX + gate contract delivered.
- Remaining: production Resend key/sender setup and enforcement flag (`AUTH_REQUIRE_RECOVERY_EMAIL=true`) at cutover.

### Pre-deploy

1. Confirm tooling:
- `node -v`
- `pnpm -v`

2. Run quality gates:
- `pnpm run ops:release-gate` (single mandatory gate command; includes tsc, regression pack, export-pack validation, storage deployment contract, password-recovery email contract, deploy smoke)

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
