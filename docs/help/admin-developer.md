# `/admin/developer` Help

Last updated: 2026-03-06

## Purpose

Super-admin control plane for platform-level operations:

1. organization lifecycle
2. per-organization configuration JSON
3. encrypted per-organization integration secrets
4. landing-page contact lead intake and delivery status
5. outbound email telemetry dashboard (`invite`, `recovery`, `contact`, `alerts`)
6. QA reliability telemetry dashboard (preview/commit/regrade latency + retry/failure health)

This route is restricted to `SUPER_ADMIN`.

## Main actions

1. Create organizations with optional slug.
2. Rename, activate/deactivate, or delete organizations.
3. Select organization scope and edit config JSON.
4. Rotate/update OpenAI, Turnitin, and SMTP API secrets.
5. Review recent early-access/contact leads and email notification status.
6. Monitor last-24h outbound email delivery metrics and recent events by channel.
7. Monitor 7-day QA reliability metrics (batch preview/commit/regrade p50/p95 latency, retry rate, failure rate, and recent runs).

## Important behavior

1. Secret values are write-only in UI and encrypted at rest.
2. Default super-admin scope is `assessor-ai` organization.
3. Landing-page contacts are persisted in DB (`ContactLead`); email is a notification channel, not the source of record.
4. Outbound email telemetry is persisted in DB (`OutboundEmailEvent`) for super-admin operations visibility.
5. Provider lifecycle webhooks are persisted in DB (`EmailProviderEvent`) and shown in delivery cards/table when `RESEND_WEBHOOK_SECRET` is configured.
6. User provisioning remains in `/admin/users`; platform configuration remains in `/admin/settings`.
7. QA telemetry is derived from `BATCH_GRADE_RUN` ops events and requires migrations for `OpsRuntimeEvent`.

## Related runbook

1. Resend webhook lifecycle setup:
   - `docs/operations/resend-webhook-setup.md`
