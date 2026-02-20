# `/admin/settings` Help

## Purpose

Configure AI and grading defaults plus app-level identity settings.
This page now acts as a control panel with quick operational indicators and direct links to Users and QA.

## Areas

1. AI Usage
OpenAI connectivity and usage/cost diagnostics.
Active model selection.
OpenAI key change checklist (TODO) and key location guidance.

2. Grading
Tone/strictness/rubric defaults.
Feedback template.
Page-note controls (enable notes, tone, limits, and criterion-code inclusion).

3. App
Active audit user (assessor identity source).
Favicon/branding controls.

## How to use

1. Set active audit user first (assessor identity policy).
2. Configure grading defaults and feedback template.
3. Tune page-note settings and preview tone examples.
4. Save and verify by running one grading cycle in submission detail.

## OpenAI Keys TODO

1. Add or rotate `OPENAI_ADMIN_KEY` (preferred key for full usage/cost visibility).
2. Set `OPENAI_API_KEY` as fallback key.
3. Restart app/runtime after key change.
4. In `/admin/settings`, run `Test config`.
5. Confirm OpenAI card shows expected key type and connected status.

## Where to Change Keys

- Local: `.env.local` in project root.
- Production/staging: deployment platform secret/environment variables.
- Never store keys in UI text fields, docs, or committed source files.
