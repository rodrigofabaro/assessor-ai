# Admin QA (`/admin/qa`)

Last updated: 2026-02-20

## Purpose

Use this page as the QA research and reporting workspace for graded submissions.

It combines:
- outcome analytics
- QA risk flags
- assessor override insights
- Turnitin send/refresh/report operations

## Core workflow

1. Open `/admin/qa`.
2. Filter by cohort, unit, assignment, status, and grade.
3. Review summary cards and `Assessor Override Breakdown`.
4. Inspect `Submission QA dataset` rows.
5. Prioritize rows with QA flags or low-confidence patterns.
6. Export filtered CSV when needed.

## Turnitin in QA

In the dataset table, each row has a Turnitin column.

You can:
- `Send to Turnitin` for unsent rows
- `Refresh %` for already-sent rows
- open `Open report` when viewer URL exists
- see similarity + AI-writing percentages when available

Page-level action:
- `Send page to Turnitin` queues all visible unsent rows.

## What to analyze

1. Student and course patterns
- identify grade spread by student/course
- spot clusters of weak outputs

2. Unit and assignment comparisons
- compare outcomes by AB in the same unit
- identify unusual distribution shifts

3. QA risk signals
- low confidence
- criteria without evidence
- regrade drift
- frequent assessor overrides

4. Turnitin indicators
- similarity % trend
- AI-writing % trend
- report availability and error hotspots

## Relationship with Audit

- QA page: analytics and moderation decisions
- Audit page (`/admin/audit`): event-level trace evidence

Use both together:
- QA identifies pattern and severity
- Audit explains timeline, actor, and causality
