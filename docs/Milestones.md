# Assessor‑AI — Milestones

Last updated: 2026-03-03

Canonical planning source:
- `docs/ROADMAP.md` (index)
- `docs/ROADMAP_ONE.md` (unified roadmap + deployment steps)
- This file is the milestone ledger.
- Documentation rules: `docs/DOCS_SYSTEM.md`.

This is the “boring but reliable” build tracker.

**Rule:** each milestone ends with a working UI path + database truth + audit trail.

Status labels:
- ✅ DONE
- 🟨 IN PROGRESS
- 🔜 NEXT
- 🧊 PARKED

## Tracking lanes (canonical)

### Priorities (Now)
- M7 export-pack endpoint/UI and deterministic replay.
- Next implementation queue (performance, instrumentation, extraction stabilization).

### Developments (Next)
- M8 production deployment and cost-controlled scaling.
- M9 authentication, UX template system, and final performance hardening.
- IV-AD AI review rollout tracked in `docs/grading/iv-ad-ai-review-roadmap.md` (supporting feature roadmap).

### Bugs and Risks (Stabilization)
- Reliability and bottlenecks tracked in `docs/operations/areas-of-improvement.md`.
- Release/readiness validation tracked in `docs/PROJECT_COMPLETION_CHECKLIST.md` and `docs/ops-checklist.md`.

---

## 🔜 Product Direction — Tutor-First Zero-Expert Flow
**Outcome**
- Final product is optimized for a non-expert tutor workflow.
- Daily operator path is:
  1. login
  2. upload assignment(s)
  3. receive marked grade output
- Advanced operations stay available but are not required for normal marking.

**Operational rule**
- Default UX must not require the tutor to use extraction/debug/mapping/governance screens.
- System runs extraction -> validation -> grading automatically in the background.
- Tutor sees only actionable status and final outputs.

**Acceptance**
- A new tutor can complete first marked output without admin assistance.
- Standard run completes in one main workflow without opening expert pages.
- Failures show plain-language reason + one clear next action (retry/fix input/contact admin).

---

## ✅ M1 — Upload & Tracking Engine
**Outcome**
- Upload single + batch submissions (PDF/DOCX)
- Store files on disk + DB record per submission
- Submission list UI + status tracking

**Acceptance**
- Uploads create DB rows
- Files persist and can be re-opened
- Status transitions are consistent and visible

---

## ✅ M2 — Reference Library (Specs/Briefs)
**Outcome**
- Admin upload reference docs (unit specs, briefs)
- Parse + store structured reference data
- Bind assignments → criteria universe

**Acceptance**
- Reference docs stored and re-usable
- Assignment binding exists and is queryable
- Locked reference versions are immutable

**Current state (2026-02-27)**
- Reference inbox and extract/lock lifecycle are live for specs/briefs.
- Assignment bindings are operational and queryable in admin workflows.
- Locked references are treated as immutable and enforced in governance routes.

---

## ✅ M3 — Extraction Engine
**Outcome**
- Extract text from PDF/DOCX
- Per‑page extraction stored separately from raw file
- Preview UI shows pages + extracted text
- Confidence/meaningful‑text guards prevent nonsense

**Acceptance**
- Submission detail page shows:
  - original preview
  - extracted text
  - stable page navigation
- DB stores extraction output:
  - page index
  - text
  - method (pdf‑text / docx / vision‑later)
  - confidence + flags

**Current state (2026-03-02)**
- Extraction runs/pages are stored and surfaced in submission detail.
- Cover/extraction quality gates and confidence signals are live.
- Extraction metadata is persisted and used by QA/automation logic.
- Brief hard validation + retry/fallback path is active to block structurally invalid task extraction before lock/reuse.

---

## ✅ M4 — Student detail cockpit
**Outcome**
- `/students/[id]` becomes the operational cockpit
- Shows student identity + submission history + latest outcomes

**Acceptance**
- Student page shows:
  - profile basics
  - table of submissions (most recent first)
  - filters (assignment / status / date)
  - click-through to `/submissions/[submissionId]`

**Current state (2026-02-27)**
- `/students/[id]` is live with profile snapshot, status badges, filters, and submission drill-down.

---

## ✅ M5 — Grading engine v1 (Explainable JSON)
**Outcome**
- Strict per‑criterion decisions with evidence pointers
- Overall word grade calculated from criteria
- Feedback derived from structured decisions (not freestyle)

**Acceptance**
- Given a submission + bound criteria:
  - produce structured JSON
  - store model + prompt version
  - store evidence mapping to pages/snippets

**Current state (2026-02-27)**
- Structured grading JSON is live in submission assessments.
- Evidence-linked criterion decisions are rendered in `Audit & outputs`.
- Grade vocabulary is constrained to Pearson HN path.

---

## ✅ M6 — Marked PDF generator
**Outcome**
- Annotated PDF linked to criteria decisions
- Original layout preserved

**Acceptance**
- Downloadable marked PDF attached to submission record
- Annotation log stored for audit

**Current state (2026-02-27)**
- Marked PDF generation is live in grading/rebuild flows.
- Overall summary is placed on final page.
- Constructive page notes are mapped from criterion evidence pages.
- Note payload/config are stored in assessment JSON for audit replay.

---

## ✅ M7 — Export packs
**Outcome**
- One‑click export pack per submission:
  - authoritative JSON
  - marked PDF
  - optional CSV summary
  - optional ZIP

**Acceptance**
- Export is deterministic and repeatable
- Past exports can be regenerated identically (versions logged)

**Current state (2026-02-27)**
- Core grading outputs (JSON + marked PDF) exist in current workflows.
- A single deterministic export-pack endpoint/UI with versioned regeneration logs is not yet complete.

Current update (2026-03-03):
- Deterministic export-pack generation endpoint and submission-detail UI action are implemented.
- Replay parity verification endpoint is implemented.
- Operator validation script is implemented (`scripts/export-pack-validation.test.js`) and wired into `test:regression-pack`.
- Live evidence capture script is implemented (`scripts/export-pack-evidence.js`, package script `ops:export-pack-evidence`).
- Live evidence captured: `docs/evidence/export-pack/20260303-130826-0226534f-6796-431b-9978-04c32783748a-97e0d665a279f806737d.json`.

---

## 🟨 Next implementation queue (2026-03-02)
1. M7 export-pack endpoint + UI
- Add one-click export per submission with deterministic bundle composition.
- Include: grading JSON snapshot, marked PDF, feedback summary artifact, optional CSV line.
- Persist export run metadata (who, when, source assessment id/version hash).

2. Export reproducibility and replay
- Add export regeneration route that replays an earlier export id and verifies hash parity.
- Store immutable export manifest with file checksums.

3. Brief extraction stabilization pack (post-hard-validation)
- Add fixture coverage for multi-scenario briefs and mixed part-key formats (`1/2/3`, `i/ii`, `b.i`).
- Add figure token/image linkage verification tests in list + detail rendering.

4. Reference inbox performance phase 2
- Add explicit client pagination in `/admin/reference`.
- Add server-side projection presets by route context (reference list vs brief detail).

5. Submission detail performance pass
- Profile heavy panels (`Approval & outputs`, criterion list, run history diffs).
- Reduce render churn on large criterion sets using memoized row segments + deferred detail panes.

6. QA reliability instrumentation
- Add lightweight latency telemetry on preview, commit, and regrade actions.
- Add dashboard cards for p50/p95 timings and retry/failure rates by route.

**Exit criteria for this queue**
- No unresolved P1 regressions on extraction or grading integrity.
- Export pack path is deterministic and auditable.
- High-traffic admin pages remain responsive under production-sized datasets.

---

## 🔜 Roadmap continuation queue (2026-03-03)
1. M7 close-out and release gate
- Complete deterministic export pack implementation and replay parity checks.
- Add release note entry + operator validation script for export parity.
- Mark M7 done only after reproducibility evidence is captured.

2. IV-AD Phase 4 start (API contract)
- Implement `POST /api/iv-ad/review-draft` with strict schema validation.
- Add structured error taxonomy for malformed AI output.
- Wire request id and audit-safe logging for review generation.
- Status (2026-03-03): complete. Endpoint + schema validation + ops-event logging merged; regression test added (`scripts/iv-ad-review-draft-schema.test.js`).

3. IV-AD Phase 5 start (review workspace)
- Add `Run AI IV Review` UI action in `/admin/iv-ad`.
- Render editable draft sections and evidence snippets panel.
- Keep manual fallback path available when AI draft fails.
- Status (2026-03-03): started. `Run AI IV Review` now calls `/api/iv-ad/review-draft` and returns editable draft sections + evidence snippets in `/admin/iv-ad`.
- Draft-to-generation handoff added: `/api/admin/iv-ad/generate` now accepts `reviewDraftJson` and uses edited comments/actions when provided.
- Approval gate added: generation requires explicit reviewer approval + approver name and persists review audit snapshot in `IvAdDocument`.
- History visibility added: `/admin/iv-ad` history table now surfaces approval metadata and review-draft audit summary.

4. M8 Phase A groundwork (deployment readiness)
- Finalize environment variable contract and secrets checklist.
- Define storage migration plan (`uploads`, `reference_uploads`, `storage/*`) with rollback steps.
- Add pre-deploy smoke route checklist to ops docs.
- Status (2026-03-03): environment contract step completed.
- Canonical contract doc: `docs/operations/environment-contract.md`.
- Runtime startup validation added (`lib/runtimeEnvContract.ts`) and wired into `app/layout.tsx` + `lib/prisma.ts`.
- Status (2026-03-03): storage migration step completed.
- Canonical migration/rollback runbook: `docs/operations/storage-migration-rollback.md`.
- Status (2026-03-03): pre-deploy smoke automation implemented.
- Command: `pnpm run ops:deploy-smoke` (`scripts/deploy-smoke-evidence.js`).
- Evidence output: `docs/evidence/deploy-smoke/*.json` (pass/fail artifact with step-level diagnostics).

5. M9 foundation (auth scaffolding spike)
- Select auth/session approach and document route protection matrix.
- Add non-breaking auth scaffolding branch plan (no production lockout risk).
- Define role model contract (`Admin`, `Assessor`, `IV`) and required route guards.

6. Documentation and runbook parity lock
- Ensure new queue deliverables update:
  - `docs/Milestones.md`
  - `RELEASE_NOTES.md`
  - affected route help pages

7. IV-AD Phase 7 continuation
- add created-date range filter in `/admin/iv-ad` history for faster period-based audit selection.
- add CSV export for the currently filtered IV-AD history rows (approval/source/date filters applied).
- Status (2026-03-03): complete. Date-range filters and filtered CSV export are live in `/admin/iv-ad`.
- Block queue completion if docs for changed behavior are missing.

**Exit criteria for continuation queue**
- M7 is closed with reproducibility proof.
- IV-AD Phase 4 endpoint contract is merged and test-covered.
- IV-AD Phase 5 UI entrypoint is live with manual fallback.
- M8 Phase A readiness checklist exists and is executable.
- Auth foundation decision is documented with route guard matrix.

Phase 6 progress (2026-03-03):
- `Generate IV-AD` launch added in submission detail.
- `/admin/iv-ad` now preloads context from submission-detail query params as a first-pass internal launch flow.
- Prefill source badges added (`auto-filled` vs manual edits), including SPEC preselection when context has `referenceSpecId`.
- Missing-context fallback added: `unknown` badges + required-manual-fields prompt for incomplete submission-detail launch context.

Phase 7 progress (2026-03-03):
- Added IV-AD document detail endpoint (`/api/admin/iv-ad/documents/[documentId]`) for full audit payload retrieval.
- Added `View audit` modal in `/admin/iv-ad` history to inspect persisted review-draft snapshot and approval metadata.
- Added `/admin/iv-ad` history filters for approval state and source type.

---

## 🔜 M8 — Production Deployment & Cost-Controlled Scaling
**Outcome**
- Move from local-only operation to stable online deployment with reproducible DB and file storage.
- Keep monthly cost low at launch, then scale by demand thresholds.

**Scope**
1. Infrastructure baseline
- Host app runtime in production (single region).
- Managed Postgres with automated backups.
- Persistent object/file storage for:
  - `uploads`
  - `reference_uploads`
  - `storage/*` outputs

2. Data migration and cutover
- Export local DB and restore to managed Postgres.
- Migrate file assets to object storage.
- Run Prisma migration deploy against production DB.
- Validate path/URL resolution for stored files.

3. Production safeguards
- Secrets management (`DATABASE_URL`, OpenAI, Turnitin, app env).
- Health checks and smoke routes after deploy.
- Backup + rollback runbook with restore drill.

4. Cost ladder (upgrade by demand)
- Stage A (lowest cost): single app instance + small managed Postgres + low-cost object storage.
- Stage B: increase DB compute/storage and app compute once p95 latency or queue depth threshold is breached.
- Stage C: add read replicas/HA patterns and stronger observability once active production load justifies it.

**Acceptance**
- Upload -> extract -> triage -> auto-grade runs online without local disk dependency.
- Existing local data is available in production (DB + files).
- Automated smoke checks pass after deploy and after rollback simulation.
- Monthly spend guardrails defined with threshold-based upgrade rules.

**Pre-go-live hardening checklist**
1. Go-live quality gates
- Define minimum extraction accuracy/confidence threshold for release.
- Define grading reliability threshold with fixture-backed pass criteria.
- Require backup/restore drill sign-off before launch.

2. Golden regression packs
- Create a locked PDF pack set:
  - clean digital text
  - noisy scan/OCR-heavy sample
  - tables/figures-heavy sample
  - equation/Greek/SI symbol-heavy sample
- Run full extraction + grading regression on every release candidate.

3. Queue-first processing
- Move extraction/grading work to background jobs with retry policy.
- Keep UI async with observable job states (queued/running/retry/failed/done).

4. Observability baseline
- Add per-upload trace id across upload -> extraction -> grading.
- Capture p50/p95 latency, failure rate, and retry metrics by stage.
- Add operator dashboard cards for extraction health and grading health.

5. Cost controls and limits
- Add token/file-size/concurrency limits per org/tenant.
- Add daily and monthly AI budget caps with alert thresholds.
- Add per-stage spend telemetry (extraction, grading, retries).

6. Extracted artifact versioning
- Version extraction schema/artifacts explicitly.
- Keep backward compatibility for old submissions when parser rules change.
- Store parser/model/prompt versions per run for audit replay.

7. Migration and rollback runbook
- Document exact production cutover steps:
  - DB export/import
  - Prisma migrate deploy
  - object storage sync
- Document rollback trigger and step-by-step restore path.

**Acceptance for pre-go-live checklist**
- Golden pack passes on latest release candidate with no P1 extraction/grading regressions.
- Background processing, telemetry, and budget controls are active in production config.
- Migration and rollback are rehearsed and signed off.

---

## 🔜 M9 — Authentication, UX Templates, and Final Performance Hardening
**Outcome**
- Add production-ready authentication with role-based route protection.
- Standardize major screens on reusable page templates/layout patterns.
- Reduce UI/API latency and bundle weight on the heaviest workflows.
- Deliver a tutor-facing workflow that hides expert complexity by default.

**Scope**
1. Authentication and access control
- Implement login page and session management.
- Add role-based access checks for `Admin`, `Assessor`, `IV` routes/actions.
- Add invite/reset/logout flows and auth audit events.

2. UX template and layout system
- Create reusable page scaffolds for:
  - workspace/list pages
  - detail/cockpit pages
  - settings/forms pages
- Standardize loading/empty/error states and action bars across admin/submissions.
- Apply responsive/mobile parity checks on all primary operator routes.
- Add a tutor-focused primary workspace (simple upload -> progress -> output) as default post-login view.
- Keep expert/admin tools behind role-aware navigation, not in default tutor workflow.

3. Performance hardening pass
- Break up oversized client/API modules in high-traffic paths.
- Remove avoidable request waterfalls and duplicate fetches.
- Verify DB index coverage for top filters/sorts and status dashboards.

4. Help/docs parity
- Remove remaining placeholder screenshot TODOs.
- Align help pages with final route labels and controls.

**Acceptance**
- Unauthenticated users cannot access protected operational routes.
- Login/logout/session expiry work end-to-end in production.
- Primary screens share template consistency (layout, states, controls).
- p95 page/API latency targets are defined and met on production-like dataset.
- Help pages and screenshots match shipped UI.
- Tutor can run upload-to-marked-output flow without expert intervention.

---

## Maintenance rule
Update milestone status only when you can point to:
- the UI path that proves it
- the DB tables/fields that store it
- the audit event or log that would defend it
