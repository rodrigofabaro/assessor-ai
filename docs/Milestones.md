# Assessor‑AI — Milestones

This is the “boring but reliable” build tracker.

**Rule:** each milestone ends with a working UI path + database truth + audit trail.

Status labels:
- ✅ DONE
- 🟨 IN PROGRESS
- 🔜 NEXT
- 🧊 PARKED

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

## 🔜 M7 — Export packs
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

---

## Maintenance rule
Update milestone status only when you can point to:
- the UI path that proves it
- the DB tables/fields that store it
- the audit event or log that would defend it
