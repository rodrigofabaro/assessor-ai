# Scope and Definition of Done

Last updated: 2026-03-03

## Purpose

Single "scope that cannot lie" page for delivery decisions.

## Product scope (current release train)

Primary operator flow:
1. Login (or active admin session context)
2. Upload submission(s)
3. Extract and triage/link
4. Grade with evidence-backed criteria decisions
5. Generate marked PDF and export artifacts
6. Support QA/IV workflows and audit traceability

Admin scope:
1. Upload/extract/review/lock specs and briefs
2. Manage assignment bindings and grading settings
3. Monitor ops metrics/events and QA actions
4. Generate IV-AD documents and maintain template workflow

## Definition of done (project spine)

A roadmap item is done only when all 4 layers are true.

### 1) Product deliverables

1. End-to-end page flow is usable in UI.
2. Happy path works with real files/data.
3. Error paths are handled with actionable outcomes.

### 2) Engineering deliverables

1. High-value tests exist for touched behavior.
2. Logging/audit trail exists for critical state changes.
3. Migrations/backups are safe and reproducible.
4. Deployment process is repeatable.

### 3) Compliance deliverables

1. Evidence is stored and reproducible.
2. Spec/brief versions are lock-governed.
3. Outputs match controlled templates/contracts.
4. Change history supports who/when/what traceability.

### 4) Operations deliverables

1. Setup/run docs are current.
2. Release notes include behavior changes.
3. Admin/operator usage docs are current.
4. Known limitations are documented.

## Non-goals (current phase)

1. Passive auto-learning from assessor overrides/submissions.
2. Automatic model fine-tuning from production grading feedback.
3. Broad multi-tenant isolation features.
4. Direct LMS writeback integrations (beyond export-ready outputs).
5. Full autonomous IV judgement without human approval.

## Top risks (current)

1. PDF extraction quality variance across noisy/scanned inputs.
2. AI output schema drift/partial responses under token pressure.
3. Mapping drift between extracted brief criteria and locked mappings.
4. Cost/latency spikes under larger production load.
5. Auth/role rollout causing route access regressions if not phased safely.

## Acceptance contract for roadmap continuation

When continuing roadmap work:
1. Update `docs/ROADMAP_ONE.md` first.
2. Implement one vertical slice at a time.
3. Validate with focused tests/smoke checks.
4. Update docs/release notes in same branch.
5. Mark done only with evidence (UI path + DB truth + audit/log signal).
