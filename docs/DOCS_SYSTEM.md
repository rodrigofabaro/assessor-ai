# Documentation System

Last updated: 2026-03-03

## Purpose

Keep documentation easy to navigate and safe to evolve as the product grows.

Role lookup:
- `docs/DOC_ROLE_MATRIX.md` maps each documentation file to its intended use.

## Canonical documents (single source by decision type)

1. Product priorities and sequencing:
   - `docs/Milestones.md`
2. Roadmap index and planning lanes:
   - `docs/ROADMAP.md`
3. Release scope contract:
   - `RELEASE.md`
4. Release history:
   - `RELEASE_NOTES.md`
5. Deployment/readiness execution:
   - `docs/ops-checklist.md`
   - `docs/PROJECT_COMPLETION_CHECKLIST.md`
6. Help center navigation:
   - `docs/help/README.md`

## Document classes

1. `Canonical`
   - Defines current truth for a decision area.
   - Changes here are authoritative.
2. `Supporting`
   - Adds feature detail, examples, runbook steps, or context.
   - Must reference its canonical source.
3. `Archive`
   - Historical record only.
   - Not a source for current behavior unless explicitly reactivated.

## Update workflow (required)

1. Update the canonical document first.
2. Update supporting docs that depend on that change.
3. Update "Last updated" date in each modified doc.
4. If behavior changed, ensure release docs reflect the change:
   - `RELEASE.md` for contract changes
   - `RELEASE_NOTES.md` for shipped changes

## Placement rules

1. Roadmap items:
   - Add to `docs/Milestones.md`.
   - Keep feature queues (for example IV-AD) in supporting roadmap docs.
2. Operational commands:
   - Keep only in runbooks/checklists (`docs/ops-checklist.md`, operations docs).
3. User/operator instructions:
   - Keep in `docs/help/*`.
4. Engineering policy and architecture:
   - Keep in `docs/operations/*`, `docs/standards/*`, `docs/grading/*`.
5. Historical snapshots/reports:
   - Move dated one-off reports to archive folders (for example `docs/operations/archive/YYYY-MM/`).
   - Keep active runbooks free from historical execution noise.

## Drift prevention checks

Run this before release:

```powershell
rg -n "TBD|FIXME" docs
rg -n "Status:\\s+OPEN|Status:\\s+DONE" docs/help docs/operations
rg -n "^Last updated:" docs README.md RELEASE.md RELEASE_NOTES.md
```

## Definition of done for documentation updates

1. A new contributor can answer:
   - what is currently prioritized
   - what shipped
   - how to run and validate core workflows
   - where route help lives
2. No conflicting guidance between canonical docs.
3. Changed behavior is documented in the same branch.
