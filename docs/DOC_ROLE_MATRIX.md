# Documentation Role Matrix

Last updated: 2026-03-03

## Purpose

Single lookup table for "which doc to use for what" to remove overlap ambiguity.

## Canonical docs

- `docs/Milestones.md`: roadmap priority and sequencing.
- `docs/SCOPE_AND_DOD.md`: definition of done, non-goals, and top risks.
- `docs/KNOWN_LIMITATIONS.md`: active limitations register.
- `docs/ROADMAP.md`: roadmap categories and navigation.
- `RELEASE.md`: release contract and scope.
- `RELEASE_NOTES.md`: shipped history.
- `docs/ops-checklist.md`: reproducible ops execution.
- `docs/help/README.md`: help route index.

## Help docs (`docs/help`)

- `README.md`: index to route guides.
- `operations-playbook.md`: end-to-end operating sequence.
- `submissions-support.md`: daily step-by-step queue tutorial.
- `submissions-onboarding.md`: first-day onboarding checklist.
- `submissions-list.md`: quick reference for `/submissions` controls.
- `submission-detail.md`: deep review flow in `/submissions/[submissionId]`.
- `upload.md`: intake/upload flow only.
- `home.md`: home dashboard guide.
- `students-pages.md`: student page navigation and usage.
- `admin-index.md`: `/admin` entry/navigation.
- `admin-settings.md`: settings UI controls and behavior.
- `admin-qa.md`: QA lane route behavior.
- `admin-reference.md`: reference inbox and lock lifecycle.
- `admin-briefs.md`: brief extraction/review/lock flow.
- `admin-specs.md`: spec extraction/import/lock flow.
- `admin-library.md`: library behavior and criteria exclusions.
- `admin-bindings.md`: assignment/spec/brief bindings workflow.
- `admin-audit-users.md`: audit/user admin behavior.

## Operations docs (`docs/operations`)

- `README.md`: active-vs-archive operations index.
- `phase1-submission-grading-runbook.md`: active grading run sequence.
- `grading-hardening-system.md`: reliability architecture and hardening rules.
- `openai-settings.md`: OpenAI operational controls and diagnostics.
- `submissions-workspace-guide.md`: queue behavior and operations guidance.
- `pearson-spec-master-workflow.md`: engineering spec workflow.
- `integrity-checks.md`: repo/runtime integrity checks.
- `local-dev-troubleshooting.md`: local environment recovery.
- `hybrid-ai-local-runbook.md`: hybrid provider setup.
- `areas-of-improvement.md`: reliability backlog and bottlenecks.
- `archive/*`: historical snapshots only (not current process truth).

## Grading docs (`docs/grading`)

- `pearson-feedback-policy.md`: canonical feedback policy rules.
- `assignment-specific-policy-playbook.md`: assignment-level policy extension pattern.
- `iv-ad-ai-review-roadmap.md`: feature-specific IV-AD roadmap and phases.

## Standards docs (`docs/standards`)

- `truth-model.md`: evidence and reference integrity contract.
- `exam-board-mode.md`: exam-board mode constraints/discipline.

## Usage rule

1. If two docs overlap, follow canonical docs first.
2. For route behavior, use `docs/help/*`.
3. For engineering policy/reliability, use `docs/operations/*`, `docs/grading/*`, `docs/standards/*`.
4. Do not use `archive/` docs as current source of truth.
