# `/submissions/[submissionId]` Help

## Purpose

Primary grading workspace for one submission: PDF review, extraction checks, grading, and audit outputs.

## Main layout

1. Top blocker strip
- readiness status
- next blocker
- fix shortcut
- assessor source

2. Info grid
- student/unit/assignment/date/status/grade overview
- click-to-fix for missing key data

3. PDF workspace
- source vs marked toggle
- viewport mode
- note-page chips (jump to pages with constructive notes)

4. Left rail (collapsed by default)
- quick actions
- assignment
- student
- cover extraction
- audit & outputs

## Quick actions

- `Run extraction`
- `Grading config`
- `Run grading`

Shortcut hints:
- `E` extraction
- `G` grading
- `?` shortcuts panel

## Audit & outputs

- Select assessment run.
- Edit feedback text.
- Apply changes to regenerate marked PDF.
- Copy feedback / criterion decisions.
- View:
  - criterion decisions
  - page feedback map
  - modality compliance
  - diff vs previous run

## Marked PDF behavior

- Overall grading summary is placed on the final page.
- Small constructive notes are placed on evidence-mapped pages.
- Regeneration can be done without rerunning AI grading.

## Common issues

- `Run grading` disabled:
  - student or assignment link missing
  - extraction not ready
- Marked PDF not available:
  - no successful grading run yet
- Unsaved feedback warning:
  - apply feedback before switching runs or leaving page
