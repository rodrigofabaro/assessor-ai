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
