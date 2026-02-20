# OpenAI Settings Operations

This document covers OpenAI operations settings available at:

- `/admin/settings`

## What the settings page shows

1. OpenAI key status
- Detects whether the app is using an admin key or standard key.
- Key resolution order used by the usage endpoint:
  - `OPENAI_ADMIN_KEY`
  - `OPENAI_ADMIN_API_KEY`
  - `OPENAI_ADMIN`
  - fallback: `OPENAI_API_KEY`

2. Connectivity
- Checks API reachability.
- Treats connectivity as healthy when org usage/cost endpoints are reachable, even if `/v1/models` is blocked by scope.

3. Usage and spend
- Shows organization usage metrics (tokens/requests) when permitted.
- Shows organization spend/cost metrics when permitted.
- Credits are intentionally not used in this view.

4. Historical fallback
- When org usage scope is missing, the app shows local telemetry history gathered from real app calls.
- Local telemetry file path:
  - `.openai-usage-log.jsonl`

5. Agent model selector
- Dropdown + save action in `/admin/settings`.
- Persisted in:
  - `.openai-model.json`
- Config API:
  - `GET /api/admin/openai-model`
  - `PUT /api/admin/openai-model`

## Key Rotation TODO

1. Update `OPENAI_ADMIN_KEY` (preferred) in environment secrets.
2. Ensure `OPENAI_API_KEY` fallback exists.
3. Restart runtime after env change.
4. Open `/admin/settings` and run `Test config`.
5. Confirm key type and connectivity cards match expectation.

## APIs added/updated

1. `GET /api/admin/openai-usage`
- Uses admin key priority above.
- Returns connectivity, usage, spend/cost, local usage fallback, and active model metadata.

2. `GET/PUT /api/admin/openai-model`
- Reads and writes the selected model for app OpenAI operations.

## App runtime usage logging

OpenAI usage telemetry is currently recorded from extraction calls in:

- `lib/extraction/text/pdfToText.ts`

Usage records are appended by:

- `lib/openai/usageLog.ts`

## Grading Prompt Controls (env)

These are runtime env controls used by grading:

- `OPENAI_GRADE_INPUT_CHAR_LIMIT`
- `OPENAI_GRADE_MAX_OUTPUT_TOKENS`
- `OPENAI_GRADE_PAGE_SAMPLE_COUNT`
- `OPENAI_GRADE_PAGE_SAMPLE_CHAR_LIMIT`

In Phase 1 cover-only mode, page samples are the primary grounding context and body text is secondary.

## Grading Config Controls (admin UI)

In `/admin/settings` -> `Grading`, operators can configure:

- core grading defaults:
  - tone
  - strictness
  - rubric usage flag
  - feedback bullet cap
  - feedback template
- page-note overlay defaults for marked PDFs:
  - enable/disable page notes
  - page-note tone
  - max pages with notes
  - max notes per page
  - include criterion code flag

These settings are persisted via:
- `GET /api/admin/grading-config`
- `PUT /api/admin/grading-config`

## Required scopes and common permission errors

1. Org usage/cost endpoints
- Require org/project permissions and usage-read capabilities.
- A 403 here means billing/usage scope is missing for that key.

2. Models endpoint
- May require `api.model.read`.
- If this scope is missing but usage/cost works, settings still reports a reachable connection.

## Current UI behavior summary

1. Admin dashboard “System” card routes to settings:
- `/admin/settings`

2. Settings page now includes:
- OpenAI key type
- Connectivity
- Token usage
- Spend/cost
- Usage breakdown
- Historical usage table
- Endpoint diagnostics
- Agent model dropdown
- Grading defaults and feedback template controls
- Page-note overlay controls + tone preview
