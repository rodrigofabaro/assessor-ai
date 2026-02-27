# Admin QA (`/admin/qa`)

Last updated: 2026-02-27

## Purpose

Use this page as the primary quality assurance workspace for graded submissions.

It combines:
- QA analytics and risk flags
- assessor override insights
- Turnitin report operations
- IV-AD generation from DB data (no manual file upload)

## Core QA -> IV workflow

1. Open `/admin/qa`.
2. Filter by cohort, unit, assignment, status, and grade.
3. Review summary cards and `Assessor Override Insights`.
4. Inspect `Submission QA Dataset` rows.
5. Prioritize rows with QA flags, evidence gaps, drift, or low confidence.
6. Open Turnitin report for any row requiring plagiarism/AI-writing checks.
7. When ready, use `Generate IV-AD` in-row.
8. If IV-AD already exists, use `Download IV-AD` (reuses existing file).
9. Export filtered CSV where moderation evidence is required.

## IV-AD from QA rows

Row action behavior:
- `Generate IV-AD`: builds a new IV document from submission + assessment + mapped spec context already in DB.
- `Download IV-AD`: appears when a valid IV file already exists for that marked submission/template.

Auto-populated fields include:
- student/programme/unit/assignment details from DB
- final grade and extracted QA context
- assessor/internal verifier identities
- assessor + verifier signature block email and current date

Important:
- If an old IV exists with placeholder assignment naming, the system regenerates once with corrected assignment title, then reuses.

## Turnitin in QA

In the dataset table, each row has a Turnitin column.

You can:
- `Send to Turnitin` for unsent rows
- `Check status` while Turnitin is still processing
- `Re-send to Turnitin` when row status is `FAILED`
- open `Open report` when row status is `COMPLETE`
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

## Pearson-aligned QA checks (practical)

Use this minimum QA checklist before confirming IV decisions:

1. Assessment decision validity
- Is the grade supported by explicit evidence in the student work?
- Are decisions aligned to relevant criteria/LO expectations?

2. Feedback appropriateness and constructiveness
- Feedback identifies strengths and improvements.
- Feedback is linked to criteria/LO outcomes, not generic praise.
- Feedback explains why higher grades were not achieved.
- Feedback gives actionable next steps for future performance.

3. Academic integrity checks
- Turnitin report status reviewed where required.
- Similarity/AI-writing indicators are interpreted with assessor judgement, not used as standalone verdicts.

4. Cohort-level consistency
- Any required action is reviewed across the full cohort, not a single script only.

## Why "feedback appropriateness" matters

In Pearson quality assurance, IV is not only about the final grade label. It also verifies whether assessor feedback is:
- fair and criterion-referenced
- clear enough for learner improvement
- consistent with centre quality standards

Weak feedback can make an otherwise plausible grade decision non-defensible during quality review because the student cannot see the evidence-based rationale or route to improve.

## Relationship with Audit

- QA page: analytics and moderation decisions
- Audit page (`/admin/audit`): event-level trace evidence

Use both together:
- QA identifies pattern and severity
- Audit explains timeline, actor, and causality

## Pearson references used

- Pearson forms and guides:
  https://qualifications.pearson.com/en/support/support-topics/delivering-our-qualifications/delivering-btec-qualifications/btec-forms-and-guides.html
- BTEC Centre Guide to Internal Assessment:
  https://qualifications.pearson.com/content/dam/pdf/Support/Quality%20Assurance/btec-centre-guide-to-internal-assessment.pdf
- BTEC Centre Guide to Internal Verification:
  https://qualifications.pearson.com/content/dam/pdf/Support/Quality%20Assurance/btec-centre-guide-to-internal-verification.pdf
