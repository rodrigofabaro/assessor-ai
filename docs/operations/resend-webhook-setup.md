# Resend Webhook Setup

Last updated: 2026-03-06

Purpose:
- Enable provider lifecycle telemetry (delivered/bounced/opened/clicked/complained) in Assessor-AI.
- Feed super-admin email health dashboard with real provider events.

## Route

- `POST /api/webhooks/resend`

## Required environment

1. `AUTH_INVITE_EMAIL_PROVIDER=resend`
2. `RESEND_WEBHOOK_SECRET=<whsec_...>`
3. Keep `RESEND_WEBHOOK_ALLOW_UNSIGNED=false` in preview/production

## Resend dashboard configuration

1. Open Resend -> Webhooks.
2. Add endpoint URL:
   - production: `https://www.assessor-ai.co.uk/api/webhooks/resend`
   - preview/local: environment-specific URL
3. Select lifecycle events at minimum:
   - delivered
   - bounced
   - opened
   - clicked
   - complained (if available)
4. Copy signing secret from Resend and set `RESEND_WEBHOOK_SECRET` in Vercel env.

## Verification behavior

1. If `RESEND_WEBHOOK_SECRET` is set:
   - request must include valid Svix signature headers:
     - `svix-id`
     - `svix-timestamp`
     - `svix-signature`
   - invalid signature returns `401 WEBHOOK_SIGNATURE_INVALID`.
2. If secret is missing:
   - route returns `503 RESEND_WEBHOOK_NOT_CONFIGURED`
   - local-only bypass is available via `RESEND_WEBHOOK_ALLOW_UNSIGNED=true`

## Data persistence

1. Outbound send attempts are stored in `OutboundEmailEvent`.
2. Provider lifecycle webhooks are stored in `EmailProviderEvent`.
3. `/api/admin/ops/email-delivery` merges both sources for dashboard cards/tables.

## Operational check

1. Send an auth test email from `/admin/users`.
2. Trigger open/click/bounce in mailbox test flow.
3. Confirm `/admin/developer` -> `Email delivery health` updates lifecycle cards and provider event table.
4. Run `pnpm run ops:email-webhook-contract` in target environment (set `AUTH_REQUIRE_EMAIL_WEBHOOK=true` for strict gate enforcement).
5. Run `pnpm run ops:email-webhook-smoke` to post a signed synthetic lifecycle event and capture evidence under `docs/evidence/email-webhook-smoke/`.
