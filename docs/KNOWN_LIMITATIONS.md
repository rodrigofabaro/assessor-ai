# Known Limitations

Last updated: 2026-03-06

## Purpose

Central list of current constraints so operators and developers are not surprised in production.

## Current limitations

1. Extraction variability on hard scans/noisy PDFs
- Impact: submissions may remain `NEEDS_OCR` or produce lower-quality evidence text.
- Mitigation: OCR fallback + extraction quality gates + manual review path.

2. Structured AI output reliability under heavy criteria payloads
- Impact: malformed/incomplete grading payload risk.
- Mitigation: schema validation, retry/fallback policy, strict guards.

3. Brief/spec mapping coverage dependency
- Impact: grading blocks when assignment mapping or active criteria coverage is incomplete.
- Mitigation: lock quality gates, drift checks, regrade after mapping fixes.

4. Build/runtime file-lock friction on some Windows environments
- Impact: occasional local build interruption (`.next/trace` lock scenarios).
- Mitigation: lock cleanup + rerun build in clean terminal/session.

5. Manual overhead for some high-governance flows
- Impact: admin/QA operations can require multiple explicit checks (by design).
- Mitigation: keep tutor-first default flow and hide advanced controls from default operator path.

6. IV-AD AI review phase is not fully shipped yet
- Impact: AI-assisted internal verification still in phased rollout.
- Mitigation: manual IV-AD path remains available; Phase 4/5 in roadmap queue.

7. Remaining runtime persistence gaps before full stateless safety
- Impact: one remaining runtime mutation path can still be non-durable on immutable deploy targets.
- Mitigation: track and migrate all `must-migrate` items in `docs/operations/persistence-classification.md` before go-live.
- Update (2026-03-03): ops events moved to DB primary storage (`OpsRuntimeEvent`) with file fallback during transition.
- Update (2026-03-03): settings audit moved to DB primary storage (`AdminSettingsAuditEvent`) with file fallback during transition.
- Update (2026-03-03): OpenAI usage telemetry moved to DB primary storage (`OpenAiUsageEvent`) with file fallback during transition.
- Update (2026-03-03): grading config and OpenAI model config moved to `AppConfig` DB JSON persistence with file fallback during transition.
- Update (2026-03-06): Turnitin config, Turnitin submission sync state, and automation policy moved to DB primary persistence with file fallback during transition.

## Operational note

Known limitations must be reviewed and updated on each release cycle.

Related docs:
1. `RELEASE_NOTES.md`
2. `docs/operations/areas-of-improvement.md`
3. `docs/ROADMAP_ONE.md`
