# Admin QA

## Purpose
- Use this page as the QA research workspace for marked submissions.
- Filter by student, course, unit code, AB number, status, and grade.
- Compare outcomes quickly before IV or standardisation meetings.

## Core Workflow
- Open `/admin/qa`.
- Apply filters for the cohort, unit, and assignment you want to inspect.
- Review `Assessor Override Breakdown` to identify reason-code and criterion hotspots.
- Review the dataset table to verify student-level outcomes.
- Use `QA Flags` to identify runs needing manual review first.
- Check grade distribution and averages to spot anomalies.
- Export the filtered report to CSV for meetings or records.

## What You Can Analyze
### Students and courses
- Identify all submissions for a specific student or course.
- Track grade spread by course.

### Unit and assignment comparisons
- Compare AB outcomes inside the same unit.
- Identify unusual grade patterns between AB numbers.

### Grade quality view
- Inspect how many are REFER, PASS, PASS_ON_RESUBMISSION, MERIT, DISTINCTION, and ungraded.
- Use average score as a fast signal, then verify detailed rows.
- Use QA reasons to investigate:
  - low confidence
  - criteria without evidence
  - regrade decision drift
  - assessor overrides
- Use override breakdown to investigate:
  - most common override reason codes
  - most frequently overridden criteria
  - highest override unit/AB hotspots

## Reports
- Export filtered submissions CSV.
- CSV includes QA review reasons for each row.
- Use exports for QA meetings, IV evidence packs, and trend review.

## Relationship With Audit
- QA page is for analysis and reporting.
- Audit page (`/admin/audit`) is the operational event log for defensibility.
- Use both together: QA for patterns, Audit for trace evidence.
