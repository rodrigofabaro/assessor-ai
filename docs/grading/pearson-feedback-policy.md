# Pearson-Aligned Feedback Policy (App Rules)

This document captures the grading/feedback rules the app should follow when Pearson is the awarding body.

## Core Rules

1. Grade by achieved criteria, not general impression
- Final grade (`PASS` / `MERIT` / `DISTINCTION`) must align with criterion outcomes.
- Feedback summary and bullets must not contradict `Criteria achieved` / `Criteria still to evidence clearly`.

2. Feedback wording must match the awarded grade
- `PASS` feedback should not read like Merit/Distinction has already been achieved.
- Avoid overclaim phrases unless explicitly caveated.

3. Feedback should focus on the work/evidence
- Prefer work-focused wording (`the report`, `your analysis`, `the submission`) over personal judgement.
- Avoid comments about the student's character/ability.

4. Use assessment-style command verbs
- Prefer verbs aligned with Pearson/BTEC criteria language:
  - `describe`, `explain`, `analyse`, `evaluate`, `justify`, `compare`, `assess`
- Avoid vague/colloquial action phrasing where possible (`talk about`, `say why`).

5. Feed-forward, not step-by-step rewriting
- Give clear next steps linked to evidence/criteria.
- Avoid excessive coaching that effectively rewrites the learner's answer.

6. Notes and final feedback must stay in sync
- Page notes should reflect page evidence and criterion gaps.
- Overall feedback should summarize the same strengths/gaps without contradiction.

## Anti-Spill Rules (Cross-Submission Safety)

- Reused templates/prompts must not leak subject-specific terms into unrelated units.
- Domain phrases (e.g. energy systems, maths/phasor, project-planning terms) should only appear when supported by:
  - extracted evidence quotes
  - criterion rationale/comment
  - assignment title/context

## UI / Assessor Experience Principles

- The app should help the assessor validate and confirm quickly.
- Feedback should be easy to defend in moderation:
  - criterion-linked
  - evidence-linked
  - grade-consistent
  - professional tone

## Implementation Notes (Current)

- `lib/grading/feedbackClaimLint.ts`
  - softens contradictions between narrative and criterion outcomes
- `lib/grading/feedbackPearsonPolicyLint.ts`
  - normalizes grade tone, work-focused language, basic command-verb phrasing, and out-of-context spill terms
- `lib/grading/pageNotes.ts`
  - page-note relevance rules and template spill guards

## Related Process Guide

- When a recurring issue needs a tailored unit/assignment rule, follow:
  - `docs/grading/assignment-specific-policy-playbook.md`
