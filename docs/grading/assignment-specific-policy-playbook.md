# Assignment-Specific Policy Playbook

Use this playbook when the global Pearson-aligned grading/feedback rules are not enough and a specific unit/assignment needs tailored grading logic.

## Goal

Add narrow, testable rules that improve grading quality for a specific assignment without causing spillover into other submissions.

## When To Add an Assignment-Specific Rule

Add a rule only when one or more of these are true:

- The rubric/brief has a requirement that is repeatedly misinterpreted by the model.
- You (assessor) repeatedly disagree with the same grading outcome pattern.
- Moderation feedback identifies a recurring grading issue.
- A criterion requires a specific type of evidence that generic logic misses.

Do **not** add a rule for one-off edge cases unless it is high-risk.

## Preferred Order of Intervention

1. Prompt/policy wording tweak (global)
- Use when the issue is wording/tone/clarity, not rubric logic.

2. Lint/validation rule (global or scoped)
- Use when output is contradictory, overclaiming, or unsafe.

3. Assignment-family rule (scoped)
- Use when a pattern applies to a category (e.g. project reports, maths-heavy assignments).

4. Assignment-specific rule (narrowest)
- Use when the requirement is unique to a unit/assignment combination.

## Rule Design Principles

- Narrow scope: gate by `unitCode`, `assignmentCode`, and evidence pattern where possible.
- Explainable: rule should be easy to justify to an assessor/moderator.
- Non-destructive: prefer adjusting confidence/wording/notes over forcing a grade unless the rubric requires it.
- Evidence-led: rule should depend on extracted evidence/rationale, not only criterion code.
- Testable: every rule must have a regression test.

## Rule Template (Use This Pattern)

- Problem:
  - What goes wrong?
  - Which criterion/assignment is affected?

- Trigger:
  - Exact conditions (unit, assignment, criterion, evidence signals)

- Action:
  - What the rule changes (decision guard, feedback lint, page note wording, UI warning)

- Safety:
  - Why it won’t spill into other units/criteria

- Test:
  - Positive case (rule should fire)
  - Negative case (rule must not fire)

## Implementation Options (Where To Put It)

- `app/api/submissions/[submissionId]/grade/route.ts`
  - For grading decision guards and pipeline-level enforcement

- `lib/grading/feedbackClaimLint.ts`
  - For contradiction/grade-consistency wording fixes

- `lib/grading/feedbackPearsonPolicyLint.ts`
  - For tone/work-focus/command-verb/spill guards

- `lib/grading/pageNotes.ts`
  - For page-note relevance, criterion-specific note phrasing

## Required Tests (Minimum)

For every new assignment-specific rule:

1. Positive trigger test
- Proves the rule activates for the intended assignment/criterion/evidence pattern

2. Cross-assignment negative test
- Proves the same criterion code in another unit does **not** get the specialized wording/logic

3. Feedback consistency test (if rule affects feedback)
- Proves the final feedback remains aligned with:
  - `Criteria achieved`
  - `Criteria still to evidence clearly`
  - `Final grade`

## Review Checklist Before Shipping

- Is this truly rubric-specific, or could it be a global improvement?
- Is the scope narrower than “criterion code only”?
- Could this rule introduce domain/template leakage?
- Are deterministic summary blocks still untouched?
- Are tests added for both trigger and non-trigger cases?

## Change Log Practice (Recommended)

When adding a tailored rule, record:

- Why it was added
- Example failure pattern (brief summary)
- Scope (`unitCode`, `assignmentCode`, criteria)
- Tests added
- Date and assessor feedback source (if relevant)

This keeps the system maintainable as more assignment-specific policies are added over time.

