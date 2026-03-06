# Persistence Classification (Deployment Readiness)

Last updated: 2026-03-06

## Purpose

Classify remaining local filesystem persistence and define what must move before stable production deployment.

## Status legend

1. `migrated`: already routed through storage provider or DB-backed flow.
2. `must-migrate`: production-risk if left on local filesystem.
3. `local-only-ok`: acceptable as local/dev artifact.

## A) User/content artifacts

1. Submission/reference/exports/IV-AD artifacts
- Status: `migrated` (provider-backed relative keys + compatibility resolution).
- Notes: now supports `FILE_STORAGE_ROOT` and legacy path resolution.

## B) Runtime config/state (high priority)

1. Grading config (`lib/grading/config.ts`, `.grading-config.json`)
- Status: `migrated` (DB primary + file fallback)
- Risk: settings drift/reset on stateless runtime.
- Delivered: `AppConfig.gradingConfig` JSON persistence with runtime cache hydration.
- Remaining hardening: remove file fallback after production confidence window.

2. OpenAI model config (`lib/openai/modelConfig.ts`, `.openai-model.json`)
- Status: `migrated` (DB primary + file fallback)
- Risk: runtime model selection not reliably persistent across instances.
- Delivered: `AppConfig.openaiModelConfig` JSON persistence with runtime cache hydration.
- Remaining hardening: remove file fallback after production confidence window.

3. Turnitin config (`lib/turnitin/config.ts`, `.turnitin-config.json`)
- Status: `migrated` (DB primary + file fallback)
- Risk: integration config inconsistency after restart/scale-out.
- Delivered: `AppConfig.turnitinConfig` JSON persistence with env-secret fallback for API key resolution.
- Remaining hardening: remove file fallback after production confidence window.

4. Turnitin submission sync state (`lib/turnitin/state.ts`, `.turnitin-submission-state.json`)
- Status: `migrated` (DB primary + file fallback)
- Risk: duplicate sync work or missed state transitions.
- Delivered: `TurnitinSubmissionSyncState` table keyed by `submissionId` with status/report fields.
- Remaining hardening: remove file fallback after production confidence window.

5. Automation policy (`lib/admin/automationPolicy.ts`, `.automation-policy.json`)
- Status: `migrated` (DB primary + file fallback)
- Risk: policy resets and inconsistent behavior between instances.
- Delivered: `AppConfig.automationPolicy` JSON persistence.
- Remaining hardening: remove file fallback after production confidence window.

## C) Audit/telemetry persistence

1. Ops event log (`lib/ops/eventLog.ts`, `.ops-events.jsonl`)
- Status: `migrated` (DB primary + file fallback)
- Risk: no durable audit trail in production.
- Delivered: `OpsRuntimeEvent` model + DB write/read path.
- Remaining hardening: remove file fallback after production confidence window.

2. Settings audit log (`lib/admin/settingsAudit.ts`, `.settings-audit.json`)
- Status: `migrated` (DB primary + file fallback)
- Risk: missing governance trace after restart.
- Delivered: `AdminSettingsAuditEvent` model + DB write/read path.
- Remaining hardening: remove file fallback after production confidence window.

3. OpenAI usage log (`lib/openai/usageLog.ts`, `.openai-usage-log.jsonl`)
- Status: `migrated` (DB primary + file fallback)
- Risk: cost/usage observability gaps.
- Delivered: `OpenAiUsageEvent` model + DB write/read path.
- Remaining hardening: remove file fallback after production confidence window.

## D) Static asset mutation

1. Runtime favicon write (`app/api/admin/favicon/route.ts` -> `public/favicon.ico`)
- Status: `must-migrate`
- Risk: asset change lost on immutable/stateless deploy target.
- Target: object storage + DB pointer/config, or build-time managed asset only.

## E) Local/dev evidence artifacts

1. Evidence outputs under `docs/evidence/*` from smoke/release scripts
- Status: `local-only-ok`
- Notes: CI/local release evidence artifacts; not runtime user data.

2. Local debug/screenshot temp files (`.tmp-screens`, local logs)
- Status: `local-only-ok`
- Notes: operational tooling artifacts, not production data contracts.

## Migration order (recommended)

1. DB-backed settings/state:
- grading config
- model config
- turnitin config/state (completed)
- automation policy (completed)

2. DB-backed audit/telemetry:
- ops events
- settings audit
- openai usage log

3. Favicon mutation redesign:
- remove runtime write to `public/`
- move to stored asset reference pattern

## Deployment gate update

Production go-live should require:

1. All `must-migrate` items above moved off local filesystem.
2. Release gate + deploy smoke pass evidence.
3. Storage provider/object storage integration validated on deployed environment.
