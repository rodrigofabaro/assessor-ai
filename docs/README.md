# Assessor AI Documentation

Last updated: 2026-03-03

This folder is the operational source of truth for extraction, mapping, grading, and audit workflows.

## Start here

1. Documentation system and update rules: `docs/DOCS_SYSTEM.md`
2. Roadmap and planning lanes: `docs/ROADMAP.md`
3. Unified delivery roadmap + deployment steps: `docs/ROADMAP_ONE.md`
4. Product milestone truth: `docs/Milestones.md`
5. Scope + Definition of Done + Non-goals + Risks: `docs/SCOPE_AND_DOD.md`
6. Known limitations register: `docs/KNOWN_LIMITATIONS.md`
7. Release scope contract: `RELEASE.md`
8. Release history: `RELEASE_NOTES.md`
9. Reproducible operations checklist: `docs/ops-checklist.md`
10. Route help center: `docs/help/README.md`
11. Latest documentation audit snapshot: `docs/DOCS_AUDIT_2026-03-03.md`
12. Operations docs index: `docs/operations/README.md`
13. Deployment environment map (Local/Preview/Production): `docs/operations/deployment-environment-map.md`
14. Operations archive policy: `docs/operations/archive/README.md`
15. Documentation role matrix: `docs/DOC_ROLE_MATRIX.md`
16. Codebase file responsibility map: `docs/SYSTEM_FILE_MAP.md`

## If you need...

1. Daily priorities and sequence:
   - `docs/Milestones.md`
2. Feature roadmap detail (IV-AD):
   - `docs/grading/iv-ad-ai-review-roadmap.md`
3. Grading architecture and reliability:
   - `docs/operations/grading-hardening-system.md`
   - `docs/grading/assignment-specific-policy-playbook.md`
4. Runbooks and operations:
   - `docs/ops-checklist.md`
   - `docs/operations/phase1-submission-grading-runbook.md`
   - `docs/operations/local-dev-troubleshooting.md`
5. Reference/spec/brief mechanics:
   - `docs/brief-extraction.md`
   - `docs/operations/pearson-spec-master-workflow.md`
6. Route-by-route operator guides:
   - `docs/help/README.md`
7. Known bottlenecks/risk backlog:
   - `docs/operations/areas-of-improvement.md`
8. Completion/readiness checks:
   - `docs/PROJECT_COMPLETION_CHECKLIST.md`

## Verification Commands

Run these before shipping extraction/grading changes:

```powershell
pnpm exec tsc --noEmit --incremental false
node scripts/tasks-tab.logic.test.js
node scripts/ai-fallback-policy.test.js
node scripts/word-linear-math.test.js
node scripts/grading-schema.test.js
node scripts/grading-confidence.test.js
node scripts/grading-input-strategy.test.js
node scripts/extraction-readiness.test.js
node scripts/extraction-integrity.test.js
node scripts/brief-readiness.test.js
node scripts/brief-mapping-codes.test.js
node scripts/brief-lo-extraction.test.js
node scripts/brief-equation-false-positives.test.js
node scripts/regression-pack.js
```

## Current Baseline

As of 2026-02-20, the full extraction/grading scripted suite passes locally.

Navigation baseline updates:

- `/submissions/[submissionId]` and `/admin/settings` load as lazy client modules for faster route transitions.
- `/submissions` uses a single upload entrypoint (`Upload assignment`) and compact batch controls (`Batch actions` menu).
- Admin settings are section-scoped (`AI`, `Grading`, `App`) with unsaved-change guard and atomic save.
- Turnitin is configured in Settings App section and surfaced in QA/submissions workflows.

## Documentation Rules

- Keep docs implementation-accurate.
- If behavior changes, update docs in the same branch.
- Do not hide known weaknesses; log them in operations docs with severity and owners.
- Update canonical docs first, then supporting docs (`docs/DOCS_SYSTEM.md`).
