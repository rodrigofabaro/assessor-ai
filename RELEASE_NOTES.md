# Release Notes

Last updated: 2026-03-06

## Unreleased

### Latest additions (2026-03-06)

- Landing-page contact intake persistence:
  - added `ContactLead` model + migration (`prisma/migrations/20260306113000_add_contact_leads`)
  - `POST /api/public/contact` now persists every valid submission in DB before notification email send
  - contact API no longer depends on email channel availability to accept leads; email delivery status is tracked per lead
- Super-admin contact intake visibility:
  - added `GET /api/admin/contact-leads` (super-admin only) with latest leads + 24h delivery summary
  - `/admin/developer` now includes `Landing contact intake` panel with sent/failed/pending status visibility
- Outbound email telemetry and dashboard:
  - added `OutboundEmailEvent` model + migration (`prisma/migrations/20260306121000_add_outbound_email_events`)
  - all email send paths now emit telemetry events by channel (`invite`, `password_recovery`, `contact_lead`, `ops_alert`, `auth_test`)
  - added `GET /api/admin/ops/email-delivery` and `Email delivery health` cards/tables in `/admin/developer`
- Resend lifecycle webhook ingestion:
  - added `EmailProviderEvent` model + migration (`prisma/migrations/20260306132500_add_email_provider_events`)
  - added `POST /api/webhooks/resend` with Svix signature verification (`RESEND_WEBHOOK_SECRET`) and idempotent provider-event persistence
  - `GET /api/admin/ops/email-delivery` now includes lifecycle rollups (`delivered`, `bounced`, `opened`, `clicked`, `complained`) plus recent provider event rows
  - added webhook contract command `pnpm run ops:email-webhook-contract` and release-gate step with strict toggle `AUTH_REQUIRE_EMAIL_WEBHOOK`
  - `/api/health/readiness` now includes `emailWebhook` check and enforces signed webhook config when `AUTH_REQUIRE_EMAIL_WEBHOOK=true`
  - added webhook smoke command `pnpm run ops:email-webhook-smoke` with evidence output (`docs/evidence/email-webhook-smoke/*.json`) and release-gate integration
  - added schema drift contract command `pnpm run ops:schema-contract` (checks required tables/columns; catches missing migration objects) and release-gate integration
  - `/api/health/readiness` now includes `schema` check to report migration drift in readiness responses
  - added OpenAI Responses write-scope contract command `pnpm run ops:openai-responses-contract` and release-gate integration for `api.responses.write` enforcement
- Docs/runbook parity:
  - updated `docs/help/admin-developer.md`, `docs/ROADMAP_ONE.md`, and `docs/Milestones.md` for the new contact-lead workflow
- QA reliability instrumentation (deployment roadmap slice):
  - `/api/submissions/batch-grade` now emits structured `qaReliability` telemetry for preview/commit/regrade runs (batch duration + per-submission latency summary + failure rate)
  - added `GET /api/admin/ops/qa-reliability` (super-admin) to aggregate 7-day p50/p95/retry/failure metrics from ops events
  - `/admin/developer` now includes `QA reliability telemetry` cards and tables (runs, p95 by action, retry/failure rates, recent run log)
  - added regression contract test: `scripts/qa-reliability-contract.test.js` (wired into `test:regression-pack`)
- Reference inbox projection hardening (performance slice):
  - `/admin/reference` list refresh now requests lightweight extracted payloads (`extracted=summary`) instead of full extracted JSON for every row
  - `/admin/reference` now uses server-backed pagination controls (page size + prev/next) with total row counts from `includeTotal`
  - added `GET /api/reference-documents/[documentId]` to hydrate full extracted JSON only for the currently selected document
  - review actions now show/obey a hydration state while full preview payload is loading
  - added regression contract test: `scripts/reference-inbox-projection-contract.test.js` (wired into `test:regression-pack`)
- Admin audit API query-budget optimization (performance slice):
  - `/api/admin/audit` now scales query take limits from requested `take` and skips unrelated event-source queries when `type` filter narrows scope
  - reduced unnecessary relation-heavy reads for single-type audit investigations
  - added regression contract test: `scripts/admin-audit-query-budget-contract.test.js` (wired into `test:regression-pack`)
- Submission detail heavy-panel projection split (performance slice):
  - `GET /api/submissions/[submissionId]` now supports `projection=summary|full` and returns summary payloads without extraction page text / full result JSON when requested
  - `/submissions/[submissionId]` now boots with summary projection and hydrates full payload on-demand when `Extraction` or `Approval & outputs` panels are opened
  - added regression contract test: `scripts/submission-detail-projection-contract.test.js` (wired into `test:regression-pack`)
- Brief extraction warning policy hardening:
  - missing-scenario warnings now trigger only when a task explicitly references scenario/context language (not globally across all tasks)
  - reduced false positives where later tasks legitimately have no scenario text
  - added regression coverage: `scripts/brief-scenario-warning-policy.test.js` (wired into `test:regression-pack`)
- Brief template-profile hardening (roadmap continuation):
  - added UniCourse template profile detection and parser metadata (`parserVersion`, `extractionProfile`, `extractionProfileDetected`, `extractionProfileCandidates`) in `lib/extractors/brief.ts`
  - extraction now runs a layout-aware UniCourse first pass with scored generic fallback selection to preserve non-template resilience
  - added regression coverage for multi-scenario + mixed part-key patterns (`1/2/3`, `i/ii`, `b.i`) via `scripts/brief-template-profile.test.js` and wired it into `test:regression-pack`
- Feedback quality hardening (VASCR continuation):
  - added annotation realism policy (`lib/grading/feedbackAnnotationPolicy.ts`) to remove generic low-signal bullets and inject assessor-style fallback notes when needed
  - `/api/submissions/[submissionId]/grade` now applies this policy after bullet de-duplication and records policy adjustments in system notes
  - added regression coverage: `scripts/feedback-annotation-policy.test.js` (wired into `test:regression-pack`)
  - added deploy gate contract command `pnpm run ops:feedback-quality-contract` and wired it into `ops:release-gate`
- IV-AD manual fallback regression lock:
  - added `scripts/iv-ad-manual-fallback-contract.test.js` (wired into `test:regression-pack`)
  - locks non-blocking heuristic fallback path when AI review is unavailable and ensures `/admin/iv-ad` keeps manual generation UX available
- Pre-launch UI launch-toggle foundation:
  - added `NEXT_PUBLIC_UI_LAUNCH_MODE` to control progressive exposure of tenant operations in admin navigation
  - when enabled, `/admin/users` is surfaced in primary admin nav while existing routes/APIs remain unchanged
  - updated admin help to document pre-launch vs launch-mode navigation behavior (`docs/help/admin-index.md`)
- M10 org-scope strict-read hardening:
  - `addOrganizationReadScope` now supports strict active-org-only mode via `AUTH_ORG_SCOPE_STRICT_READS=true` (legacy alias: `ORG_SCOPE_STRICT_READS`)
  - default compatibility behavior is unchanged (`organizationId=<activeOrgId>` or `organizationId=null` fallback while migration remains in progress)
  - added regression contract coverage: `scripts/org-scope-read-contract.test.js` (wired into `test:regression-pack`)
- Runtime state persistence migration (deployment hardening slice):
  - added migration `prisma/migrations/20260306200000_add_turnitin_automation_persistence`:
    - `AppConfig.turnitinConfig` JSON
    - `AppConfig.automationPolicy` JSON
    - `TurnitinSubmissionSyncState` table
  - switched Turnitin config, Turnitin submission sync state, and automation policy to DB-primary persistence with compatibility fallback to legacy local files
  - updated readiness/schema contract checks to include the new table/columns
  - added regression contract: `scripts/turnitin-automation-persistence-contract.test.js` (wired into `test:regression-pack`)
- Favicon persistence migration (deployment hardening slice):
  - added migration `prisma/migrations/20260306213000_add_app_config_favicon_storage`:
    - `AppConfig.faviconStoragePath`
    - `AppConfig.faviconMimeType`
  - `/api/admin/favicon` no longer writes `public/favicon.ico`; uploads now persist via storage provider (`storage/branding/favicon.*`) and DB pointer fields
  - added runtime favicon serving route `GET /api/favicon` (storage-backed with bundled fallback)
  - root metadata and settings/help previews now use `/api/favicon`
  - readiness/schema contract checks now include favicon storage columns

### Latest additions (2026-03-05)

- User CRUD + org scope completion:
  - `/admin/users` now supports create/read/update/delete in one workflow
  - create-user form is collapsed by default and opened on demand
  - super admin can switch organization scope in-page; metrics and directory results are scoped to selected org
  - backend additions:
    - `GET /api/admin/users?organizationId=<id>` scope-aware listing
    - `DELETE /api/admin/users/[userId]` with org-scope and self-delete guards
- Full descriptor import hardening:
  - fixed serverless PDF parsing failure (`Cannot find module .../pdf.worker.mjs`) by forcing worker-off PDF.js mode in suite extraction path
  - added unit picker to `Admin -> Specs -> Full descriptor import (beta)` so operators can import only selected unit codes
  - async run endpoint now accepts selected unit codes and propagates requested unit count in job summary
- Specs library UX cleanup:
  - removed `Export unit registry JSON` action from `Spec Master Health`
  - unit metadata card no longer shows confusing filename-based title; now shows original file, storage path, and direct file-open link

1. M9 password recovery hardening (tokenized flow):
   - replaced temporary-password recovery with one-time expiring token links
   - added `PasswordResetToken` model + migration (`prisma/migrations/20260305132000_add_password_reset_tokens`)
   - added `POST /api/auth/password-recovery/confirm` and `/auth/reset` page
   - recovery links now use `AUTH_APP_ORIGIN`, token hashing via `RESET_TOKEN_PEPPER`, and configurable TTL (`AUTH_PASSWORD_RECOVERY_TTL_MINUTES`)
2. Landing page contact email intake:
   - replaced early-access `mailto` CTA with real contact form submission on `/`
   - added `POST /api/public/contact` with honeypot + IP-based rate limiting and ops telemetry events
   - added `CONTACT_FORM_TO` env for contact inbox routing (fallback: `contact@assessor-ai.co.uk`)
3. Admin user reset email behavior:
   - `Admin -> Users` now uses tokenized recovery for reset action when provider is configured
   - row action label now reflects behavior (`Send reset link`)
4. Email provider operations enabled:
   - production/preview/development envs configured with Resend-based auth email delivery
   - verification email sent to `rodrigo@unicourse.org` during rollout validation
5. Auth recovery + cleanup (production):
   - restored normal DB-backed login for `deploy.smoke.admin@assessor-ai.co.uk` (`source: app-user`)
   - removed temporary emergency login and recovery-key bypass routes after successful recovery
6. Legacy-schema compatibility hardening:
   - strengthened auth (`/api/auth/login`, `/api/auth/password-reset`) and user admin API (`/api/admin/users`) fallbacks for older production schema variants
7. Upload pipeline hardening (deployment continuation):
   - added storage write-root fallback chain in `lib/storage/provider.ts` (`FILE_STORAGE_ROOT` -> runtime tmp -> cwd)
   - strengthened upload create-submission compatibility in:
     - `/api/submissions/upload`
     - `/api/submissions/blob-finalize`
   - submission create now uses stable return selects and minimal fallback payloads for partially migrated schemas
   - upload routes now raise explicit schema-incompatible guidance when create remains incompatible after fallback
   - added stage-level upload diagnostics in API error message
   - upload failures now also include `errorCode`/`errorName` details for faster production triage
   - deploy-smoke evidence now captures API `requestId` and `details` payload for failed steps
8. Email channel hardening (M9.1 slice):
   - landing contact notifications now set `Reply-To` to the submitter email
   - added alert dispatch helper + runtime wiring for critical upload failures:
     - `/api/submissions/upload`
     - `/api/submissions/blob-finalize`
   - added env keys in contract/examples:
     - `CONTACT_EMAIL_FROM`
     - `ALERT_EMAIL_FROM`
     - `ALERT_EMAIL_TO`
9. Contract/script ergonomics:
   - added alias command `pnpm run ops:password-recovery-email-contract`
   - added guided one-command production cutover helper: `pnpm run ops:cutover-prod` (`scripts/cutover-prod.ps1`)
   - added alert-channel smoke command: `pnpm run ops:alert-smoke` with evidence in `docs/evidence/ops-alert-smoke/`
   - captured smoke dry-run evidence: `docs/evidence/ops-alert-smoke/20260305-153440.json`
10. Operations alerting docs:
   - added trigger matrix: `docs/operations/email-alert-trigger-matrix.md`
   - updated environment contract and ops checklist for alert-channel validation (`AUTH_REQUIRE_ALERT_EMAIL`, smoke flow)
11. Current release blocker (still open):
   - production deploy-smoke continues to fail at upload stage: `UPLOAD_FAILED` -> `Upload failed at create_submission`
   - storage target locations/credentials are not configured yet (operator confirmed)
12. M9 password recovery email enablement (deployment roadmap continuation):
   - initial implementation shipped with temporary-password issue + `mustResetPassword` enforcement
   - superseded by tokenized recovery flow in current unreleased changes
   - login form now includes `Forgot password?` flow calling recovery endpoint
   - added gate command `pnpm run ops:password-recovery-contract`
   - release gate now includes password-recovery email contract check before deploy smoke
13. M8 storage deployment contract hardening (deployment roadmap continuation):
   - added gate command `pnpm run ops:storage-contract`
   - release gate now includes storage deployment contract check before deploy smoke
   - added strict cutover flag `ENV_CONTRACT_REQUIRE_STORAGE_ROOT=true` to hard-fail when durable `FILE_STORAGE_ROOT` is not configured
14. Specs full-descriptor in-app import (beta):
   - added admin suite upload token endpoint: `POST /api/admin/spec-suite/blob-token`
   - added admin suite import endpoint: `POST /api/admin/spec-suite/import` (legacy synchronous path)
   - added suite importer service (`lib/specSuite/importFromDescriptor.ts`) to split full Pearson descriptor PDF into unit-level `SPEC` reference docs
   - `/admin/specs` Extraction Inbox now includes `Full descriptor import (beta)` action for one-file suite onboarding
15. Specs full-descriptor async jobs + report download:
   - added `SpecSuiteImportJob` model + migration (`prisma/migrations/20260305190000_add_spec_suite_import_jobs`)
   - added async job endpoints:
     - `POST /api/admin/spec-suite/jobs` (create queued import job)
     - `POST /api/admin/spec-suite/jobs/[jobId]/run` (claim + execute import)
     - `GET /api/admin/spec-suite/jobs/[jobId]` (poll status/progress)
     - `GET /api/admin/spec-suite/jobs/[jobId]/report` (download JSON import report)
   - `/admin/specs` now polls async import progress and exposes report download when complete
7. M8 storage backend enablement for Vercel durability (deployment roadmap continuation):
   - added storage provider mode `STORAGE_BACKEND=vercel_blob` with `BLOB_READ_WRITE_TOKEN`
   - upload/reference/IV write paths now persist provider-returned storage paths (remote URL-safe)
   - core read paths now resolve remote-backed files through local cache hydration (`resolveStorageAbsolutePathAsync` / `readStorageFile`)
   - runtime env contract now validates storage backend config (`STORAGE_BACKEND`, `BLOB_READ_WRITE_TOKEN`, `ENV_CONTRACT_REQUIRE_STORAGE_ROOT`)
8. M8 large-reference upload path (deployment roadmap continuation):
   - added `POST /api/reference-documents/blob-token` for short-lived client upload tokens
   - added `POST /api/reference-documents/blob-finalize` to validate uploaded Blob objects and persist `ReferenceDocument` rows
   - specs upload UI now uploads PDFs directly browser -> Vercel Blob (multipart enabled for larger files) and finalizes metadata server-side
   - specs upload automatically falls back to legacy multipart server upload when client Blob upload is disabled (local/filesystem mode)
9. M8 large-submission upload path (deployment roadmap continuation):
   - added `POST /api/submissions/blob-token` for short-lived client upload tokens
   - added `POST /api/submissions/blob-finalize` to validate uploaded Blob objects, create submission records, and trigger extraction
   - `/upload` workspace now uploads files directly browser -> Vercel Blob (multipart enabled for larger files) and finalizes metadata server-side
   - `/upload` workspace automatically falls back to legacy `/api/submissions/upload` when client Blob upload is disabled (local/filesystem mode)

10. M7 export-pack foundation:
   - added deterministic submission export-pack generation (`assessment-snapshot.json`, `feedback-summary.txt`, `summary.csv`, `marked.pdf`, `manifest.json`)
   - added replay parity verification endpoint for earlier export ids
   - wired submission-detail utilities with `Generate export pack` and `Replay parity check` actions
11. Organization scope hardening (user/org linkage):
   - added runtime org-scope self-heal in request session resolution: when signed session has no `orgId`, server now resolves and links user to an org scope before route checks
   - login/session bootstrap now proactively backfill user org linkage (`organizationId` + default active membership) when missing
   - `/api/auth/organizations` now self-heals empty membership state and returns a valid active org option
   - added one-shot backfill command `pnpm run ops:backfill-org-scope` for repairing existing users in bulk
12. Auth email operations visibility:
   - added `GET /api/admin/auth/email-health` for provider/readiness checks
   - added `POST /api/admin/auth/email-test` to send a safe delivery test email
   - `Admin → Users` now includes email readiness details and a “Send test email” control
10. IV-AD Phase 4 API contract:
   - added `POST /api/iv-ad/review-draft` with strict request schema validation
   - added strict AI response schema enforcement for typed review draft JSON
   - added request-id aware error taxonomy + ops event logging for invalid request/provider/schema failures
   - added `scripts/iv-ad-review-draft-schema.test.js` and included it in `test:regression-pack`
8. IV-AD Phase 5 kickoff:
   - `/admin/iv-ad` now includes `Run AI IV Review` action before final DOCX generation
   - review draft sections are editable in-page (decision/feedback/criteria/integrity/comments/actions)
   - evidence snippets and warning list are rendered from the strict review-draft contract
   - final generation now accepts `reviewDraftJson` override and uses edited draft comments/actions when present
   - final generation now enforces an explicit approval gate (`reviewApproved`, `reviewApprovedBy`) before DOCX output
   - IV-AD document records now persist review draft audit snapshot + approval metadata (`reviewDraftJson`, `reviewDraftApproved*`)
   - `/admin/iv-ad` history now shows review audit status (approved/by/at, source type, warnings/evidence counts)
9. IV-AD Phase 6 kickoff:
   - submission detail now includes a `Generate IV-AD` launch action that opens `/admin/iv-ad` with prefilled context
   - `/admin/iv-ad` now accepts submission-detail query prefill for key fields, grade override, key notes, and approver default
   - launch flow now also carries `referenceSpecId` when available and shows source badges for auto-filled fields in `/admin/iv-ad`
   - missing-context fallback now surfaces `Missing context` badges and a manual-completion prompt list when prefill data is unavailable
10. IV-AD Phase 7 kickoff:
   - added `GET /api/admin/iv-ad/documents/[documentId]` for full audit detail retrieval
   - `/admin/iv-ad` history now supports `View audit` modal to inspect persisted review snapshot, approval metadata, and evidence/warnings detail
   - `/admin/iv-ad` history now supports approval/source filters for faster audit triage
   - `/admin/iv-ad` history now supports date-range filtering (`From`/`To`) and CSV export of the currently filtered audit rows
11. M7 export-pack operational validation:
   - added `scripts/export-pack-validation.test.js` to verify export manifest required files + checksum parity against disk artifacts
   - wired export-pack validation into `scripts/regression-pack.js`
   - added package script `pnpm run test:export-pack-validation`
   - added package script `pnpm run ops:export-pack-evidence` to generate+replay export pack and write a versioned evidence artifact in `docs/evidence/export-pack/`
   - live evidence captured on 2026-03-03: `docs/evidence/export-pack/20260303-130826-0226534f-6796-431b-9978-04c32783748a-97e0d665a279f806737d.json`
12. M8 Phase A (environment contract) start:
   - added canonical env contract doc: `docs/operations/environment-contract.md`
   - added centralized runtime env validator: `lib/runtimeEnvContract.ts`
   - wired startup validation into `app/layout.tsx` and `lib/prisma.ts`
   - startup checks now cover `DATABASE_URL` and at least one OpenAI credential key
13. M8 Phase A (storage migration + rollback) start:
   - added canonical storage migration runbook: `docs/operations/storage-migration-rollback.md`
   - runbook includes backup hashes, DB restore, file restore/sync, verification gates, rollback triggers, and rollback procedure
14. M8 Phase A (pre-deploy smoke automation) start:
   - added one-command smoke script: `pnpm run ops:deploy-smoke` (`scripts/deploy-smoke-evidence.js`)
   - smoke script performs upload -> extract -> link -> grade -> marked PDF -> export -> replay parity path
   - writes pass/fail evidence artifact to `docs/evidence/deploy-smoke/*.json` with step-level diagnostics
15. Runtime env contract refinement:
   - adjusted startup contract severity to hard-fail by default only on `DATABASE_URL`
   - OpenAI credential requirement is warning by default and can be hard-failed with `ENV_CONTRACT_REQUIRE_OPENAI=true`
16. M8 Phase A deploy-smoke evidence:
   - automated deploy smoke passed on 2026-03-03 via `pnpm run ops:deploy-smoke`
   - evidence artifact: `docs/evidence/deploy-smoke/20260303-140208.json`
17. M8 Phase A release gate automation:
   - added one-command release gate: `pnpm run ops:release-gate` (`scripts/release-gate-evidence.js`)
   - release gate runs: tsc + regression pack + export-pack validation + deploy smoke
   - writes pass/fail artifact to `docs/evidence/release-gate/*.json`
18. M8 Phase A release gate evidence:
   - release gate passed on 2026-03-03 via `pnpm run ops:release-gate`
   - release gate artifact: `docs/evidence/release-gate/20260303-142551.json`
   - deploy smoke artifact from same gate run: `docs/evidence/deploy-smoke/20260303-142706.json`
19. M9 foundation (auth scaffolding) start:
   - added feature-flagged RBAC scaffold: `middleware.ts` + `lib/auth/rbac.ts`
   - added canonical role matrix and rollout path: `docs/operations/auth-role-matrix.md`
   - added `AUTH_GUARDS_ENABLED` env toggle (default false) to keep rollout non-breaking
   - added cookie role bridge: `POST /api/auth/role-sync` + layout sync component (`components/auth/AuthRoleSync.tsx`)
   - added session-backed identity scaffold: `POST /api/auth/session/bootstrap` + signed cookie helper (`lib/auth/session.ts`) with `AUTH_SESSION_SECRET`
   - added auth scaffold contract regression test (`scripts/auth-scaffold-contract.test.js`) and included it in `test:regression-pack`
   - added staging-only auth guard smoke command: `pnpm run ops:auth-guard-smoke` (`scripts/auth-guard-smoke.js`) with evidence output in `docs/evidence/auth-guard-smoke/`
   - fixed middleware bundling path for Edge runtime by replacing `node:crypto` dependency with Edge-safe session verification helper (`lib/auth/sessionEdge.ts`)
19. M8 documentation alignment for first Vercel deployment:
   - updated `docs/ROADMAP_ONE.md` status snapshot to reflect active M8 deployment target
   - added explicit "What is still missing before first Vercel deploy" checklist (DB, persistent object storage integration, production secrets, migrations, smoke evidence, domain cutover)
   - marked local filesystem persistence as the current launch blocker for safe production rollout
20. Deployment environment model documentation:
   - added `docs/operations/deployment-environment-map.md` as canonical Local/Preview/Production workflow
   - documented GitHub->Vercel promotion flow and strict separation of code vs database/files
   - linked deployment environment map from `docs/README.md`, `docs/operations/README.md`, and `docs/ROADMAP_ONE.md`
21. Pre-push production gate command:
   - added `scripts/prepush-prod-check.ps1` and package script `pnpm run ops:prepush-prod`
   - enforces branch/working-tree policy before merge to `main` and runs `tsc`, `test:regression-pack`, and `test:export-pack-validation`
   - writes pass/fail evidence artifacts to `docs/evidence/prepush-prod/*.json`
   - documented in `docs/ops-checklist.md`, `docs/operations/deployment-environment-map.md`, and `docs/ROADMAP_ONE.md`
22. M8 storage migration slice 1 (provider abstraction):
   - added shared storage helper: `lib/storage/provider.ts` (relative storage keys, read resolution across cwd/repo/env root, write root override via `FILE_STORAGE_ROOT`)
   - migrated submission upload to store relative keys (`uploads/<uuid>-<filename>`) and write through provider
   - migrated submission file download and marked-file routes to resolve legacy absolute and new relative storage paths through provider
   - migrated reference document upload writes through provider (relative `reference_uploads/<uuid>-<filename>`)
   - migrated export-pack artifact writes/reads through provider (`storage/exports/*`) including run-log append and replay manifest resolution
   - migrated marked-PDF generation (`submission_marked/*`) and IV-AD storage writes (`storage/iv-ad/*`) through provider-aware paths
   - migrated brief rubric and IV attachment uploads to provider-backed relative storage keys
   - added optional env contract input in `.env.example`: `FILE_STORAGE_ROOT`
23. M8 storage migration slice 2 (grading/extraction path resolution):
   - `lib/extraction.ts` now resolves input `storagePath` through storage provider compatibility resolver (relative + legacy absolute)
   - grading raw-PDF render path in `/api/submissions/[submissionId]/grade` now resolves through provider (`renderPdfPagesForGrading`)
   - reference figure cache write path now uses provider-backed storage key (`storage/reference_images/*`)
24. M8 storage migration slice 3 (IV-AD route resolution):
   - replaced remaining IV-AD read-path resolution call sites with provider resolver (`resolveStorageAbsolutePath`) in:
     - `/api/iv-ad/review-draft`
     - `/api/admin/iv-ad/documents/[documentId]/file`
     - `/api/admin/iv-ad/generate`
     - `/api/admin/iv-ad/generate-from-submission`
   - added explicit unresolved-path API errors for template/marked-PDF paths to improve deployment triage
   - deploy smoke passed after this slice: `docs/evidence/deploy-smoke/20260303-170308.json`
25. M8 persistence sweep and blocker classification:
   - added canonical persistence matrix: `docs/operations/persistence-classification.md`
   - classified remaining local filesystem dependencies into `must-migrate` vs `local-only-ok`
   - documented remaining production blockers in unified roadmap and known limitations
26. M8 `must-migrate` execution slice 1 (ops events):
   - added Prisma model + migration for durable ops event storage: `OpsRuntimeEvent`
   - switched `appendOpsEvent` to DB primary write with file fallback (`.ops-events.jsonl`) on DB failure
   - switched `/api/admin/ops/events` to DB primary read with legacy file fallback
   - generated Prisma client (`pnpm prisma generate --no-engine`) and validated with `tsc` + regression pack
   - added runtime compatibility guard in `appendOpsEvent` so environments with older Prisma client/missing migration safely fall back to file log
   - deploy smoke pass after guard: `docs/evidence/deploy-smoke/20260303-171515.json`
27. M8 `must-migrate` execution slice 2 (settings audit):
  - added Prisma model + migration for settings audit events: `AdminSettingsAuditEvent`
  - switched `appendSettingsAuditEvent` to DB primary write with file fallback (`.settings-audit.json`)
  - switched `/api/admin/settings-audit` to DB primary read with file fallback
  - updated persistence classification and roadmap blocker list to reflect completed migration
28. Super-admin developer console + org scope defaults:
  - added new super-admin route `/admin/developer` with route-level access guard (`session.isSuperAdmin` / env super-admin)
  - moved organization lifecycle and per-organization config/secret controls into developer console
  - updated top admin navigation to surface `Developer` only for super-admin sessions
  - `/admin/settings/organization` now redirects to `/admin/developer#organization-settings`
  - added super-admin default organization target `assessor-ai` via `ensureSuperAdminOrganization()` and wired login/session/org APIs to prefer it
29. M8 `must-migrate` execution slice 3 (OpenAI usage telemetry):
   - added Prisma model + migration for usage telemetry: `OpenAiUsageEvent`
   - switched `recordOpenAiUsage` to DB primary write with file fallback (`.openai-usage-log.jsonl`)
   - switched `readOpenAiUsageHistory` to DB primary read with file fallback and updated `/api/admin/openai-usage` to await async history read
   - validated with `pnpm prisma generate --no-engine`, `tsc`, regression pack, and deploy smoke evidence: `docs/evidence/deploy-smoke/20260303-172205.json`
29. M8 `must-migrate` execution slice 4/5 (model + grading settings):
   - extended `AppConfig` with JSON-backed settings persistence fields: `openaiModelConfig`, `gradingConfig`
   - switched `read/writeOpenAiModel` to DB primary persistence with runtime cache hydration and file fallback
   - switched `read/writeGradingConfig` to DB primary persistence with runtime cache hydration and file fallback
   - validated with `pnpm prisma generate --no-engine`, `tsc`, regression pack, and deploy smoke evidence: `docs/evidence/deploy-smoke/20260303-172621.json`
30. Deployment hardening (Vercel build type safety + runbook):
   - hardened grading alignment helper typing in `/api/submissions/[submissionId]/grade` so criteria alignment normalization accepts unknown arrays safely
   - added explicit Vercel deployment runbook: `docs/operations/vercel-bulletproof-deploy.md`
31. Pre-push gate hardening for Vercel parity:
   - `ops:prepush-prod` now runs `pnpm run build` (after clearing `.next/trace` best-effort) before regression checks
   - this catches Vercel-equivalent Next.js build/type issues before push
32. M10 multi-organization foundation kickoff:
   - added roadmap scope for multi-org tenancy in `docs/Milestones.md` and `docs/ROADMAP_ONE.md`
   - added role model extension docs in `docs/operations/auth-role-matrix.md` (`SUPER_ADMIN`, `ORG_ADMIN`)
   - added Prisma foundation models + migration:
     - `PlatformRole` on `AppUser`
     - `OrganizationMembership` (user-to-org membership with default/active flags)
     - `OrganizationSetting` (per-org config JSON)
     - `OrganizationSecret` (per-org encrypted secret storage)
   - added auth/session membership resolution in:
     - `POST /api/auth/login`
     - `POST /api/auth/session/bootstrap`
   - added organization context APIs:
     - `GET /api/auth/organizations`
     - `POST /api/auth/switch-organization`
   - added org settings/secrets API scaffold:
     - `GET|PUT /api/admin/organizations/[organizationId]/settings`
   - updated user admin APIs to seed/update memberships when creating or editing users:
     - `GET|POST /api/admin/users`
     - `PATCH /api/admin/users/[userId]`
33. M10 role boundary + org context UX slice:
   - added global header organization switcher component (`components/OrganizationSwitcher.tsx`) wired to:
     - `GET /api/auth/organizations`
     - `POST /api/auth/switch-organization`
   - added dedicated organization settings page:
     - `/admin/settings/organization`
   - added org settings navigation entry in admin settings workspace
   - tightened admin API boundaries:
     - `GET|POST /api/admin/organizations` now super-admin only
     - non-super admins in `GET|POST /api/admin/users` are scoped to active organization
     - non-super admins in `PATCH /api/admin/users/[userId]` can only manage users within active organization

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
