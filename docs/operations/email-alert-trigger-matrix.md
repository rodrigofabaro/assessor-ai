# Email Alert Trigger Matrix

Last updated: 2026-03-06

Purpose:
- Define which runtime failures should trigger operational alert emails.
- Keep alerting narrow to high-impact failures (avoid alert fatigue).

Primary channel:
- Recipient: `ALERT_EMAIL_TO`
- Sender: `ALERT_EMAIL_FROM` (fallback `AUTH_EMAIL_FROM`)
- Transport: Resend (`AUTH_INVITE_EMAIL_PROVIDER=resend`)

## Trigger matrix

1. Upload intake failure (`/api/submissions/upload`)
- Trigger: terminal upload failure in API catch block
- Severity: P1
- Current status: enabled

2. Blob finalize failure (`/api/submissions/blob-finalize`)
- Trigger: terminal finalize failure in API catch block
- Severity: P1
- Current status: enabled

3. Extraction failure (`/api/submissions/[submissionId]/extract`)
- Trigger: extraction run ends in `FAILED` status
- Severity: P1
- Current status: pending

4. Grading failure (`/api/submissions/[submissionId]/grade`)
- Trigger: grade endpoint returns terminal failure
- Severity: P1
- Current status: pending

5. Auth anomaly (repeated failed recovery/lockout threshold)
- Trigger: rate-limit or repeated auth recovery failure threshold breach
- Severity: P2
- Current status: enabled

## Validation command

Use:

```powershell
pnpm run ops:alert-smoke
```

Evidence output:
- `docs/evidence/ops-alert-smoke/YYYYMMDD-HHMMSS.json`

## Operational policy

1. Only route high-impact failures to `ALERT_EMAIL_TO`.
2. Include route, stage, request ID, and timestamp in alert body.
3. Keep alerts actionable; avoid informational/noise events.
4. Validate alert channel in staging before production cutover.
