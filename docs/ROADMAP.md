# Assessor-AI Roadmap Index

Last updated: 2026-03-05

Documentation governance:
- See `docs/DOCS_SYSTEM.md` for rules on canonical vs supporting docs.

## Canonical roadmap

Primary source of truth for "what gets built next":
- `docs/ROADMAP_ONE.md`

Milestone ledger:
- `docs/Milestones.md`

Rule:
- New roadmap items must be added to `docs/ROADMAP_ONE.md` first.
- Feature-specific roadmap docs should link back to their milestone item.

## Categorized tracking lanes

Use these categories for all planning updates.

1. Priorities (Now)
   - Active implementation queue in `docs/Milestones.md`:
     - `P0 M8 storage deployment setup/fix`
     - `P0 M9 password recovery email enablement`
     - `P1 M9.1 email architecture hardening (transactional/support/alerts routing + deliverability)`
     - `M10 multi-organization tenant isolation foundation`
2. Developments (Next)
   - Planned roadmap milestones in `docs/Milestones.md`:
     - `M8 Production Deployment & Cost-Controlled Scaling`
     - `M9 Authentication, UX Templates, and Final Performance Hardening`
     - `Pre-launch development-mode UX profile (simple operator UI, full platform architecture retained)`
   - Feature roadmap track:
     - `docs/grading/iv-ad-ai-review-roadmap.md` (Phase 4-7 queue)
3. Bugs and Risks (Stabilization)
   - Reliability/hardening backlog:
     - `docs/operations/areas-of-improvement.md`
   - Release-readiness and operational risk checks:
     - `docs/PROJECT_COMPLETION_CHECKLIST.md`
     - `docs/ops-checklist.md`

## Supporting planning docs (not canonical)

1. Feature roadmap:
   - `docs/grading/iv-ad-ai-review-roadmap.md`
   - Scope: IV-AD AI-assisted review design and phase queue.
2. Improvement backlog:
   - `docs/operations/areas-of-improvement.md`
   - Scope: bottlenecks and technical hardening opportunities.
3. Release contract:
   - `RELEASE.md`
   - Scope: release in/out scope and acceptance contract.
4. Release history:
   - `RELEASE_NOTES.md`
   - Scope: shipped changes by version/date.
5. Completion checklist:
   - `docs/PROJECT_COMPLETION_CHECKLIST.md`
   - Scope: readiness and verification before deploy.
6. Ops execution checklist:
   - `docs/ops-checklist.md`
   - Scope: reproducible environment and smoke flow commands.

## How to keep this clean

1. Put priorities, sequencing, and status in `docs/Milestones.md`.
2. Keep feature docs implementation-specific and linked to milestone IDs.
3. If priorities change, update:
   - `docs/Milestones.md` first
   - then affected supporting docs
4. Keep "Last updated" dates accurate in each planning file.
