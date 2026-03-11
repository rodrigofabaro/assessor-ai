export function isSubmissionAutomationCronAuthorized(request: Request) {
  const vercelCron = String(request.headers.get("x-vercel-cron") || "").trim();
  if (vercelCron) {
    return { ok: true, mode: "vercel-cron" as const };
  }

  const configuredSecret = String(process.env.SUBMISSION_AUTOMATION_CRON_SECRET || "").trim();
  if (!configuredSecret) {
    return {
      ok: false,
      mode: "missing-secret" as const,
      reason: "SUBMISSION_AUTOMATION_CRON_SECRET is not configured.",
    };
  }

  const authHeader = String(request.headers.get("authorization") || "").trim();
  const expected = `Bearer ${configuredSecret}`;
  if (authHeader && authHeader === expected) {
    return { ok: true, mode: "bearer" as const };
  }

  return {
    ok: false,
    mode: "unauthorized" as const,
    reason: "Missing or invalid automation cron authorization.",
  };
}
