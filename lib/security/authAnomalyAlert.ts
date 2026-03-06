import { sendOpsAlertEmail } from "@/lib/auth/inviteEmail";
import { appendOpsEvent } from "@/lib/ops/eventLog";

type AuthAnomalyAlertInput = {
  kind: string;
  actor: string | null;
  route: string;
  details?: Record<string, unknown>;
};

type AlertState = {
  sentByKey: Map<string, number>;
};

const globalForAuthAlert = globalThis as unknown as {
  __authAnomalyAlertState?: AlertState;
};

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function getState() {
  if (!globalForAuthAlert.__authAnomalyAlertState) {
    globalForAuthAlert.__authAnomalyAlertState = { sentByKey: new Map<string, number>() };
  }
  return globalForAuthAlert.__authAnomalyAlertState;
}

function getCooldownMs() {
  const n = Number(process.env.AUTH_ANOMALY_ALERT_COOLDOWN_MINUTES || 30);
  if (!Number.isFinite(n) || n < 1) return 30 * 60 * 1000;
  return Math.floor(n) * 60 * 1000;
}

function shouldSendAlert(key: string) {
  const now = Date.now();
  const cutoff = now - getCooldownMs();
  const state = getState();

  for (const [candidate, ts] of state.sentByKey.entries()) {
    if (!Number.isFinite(ts) || ts < cutoff) state.sentByKey.delete(candidate);
  }

  const last = state.sentByKey.get(key) || 0;
  if (last >= cutoff) return false;
  state.sentByKey.set(key, now);
  return true;
}

export async function maybeSendAuthAnomalyAlert(input: AuthAnomalyAlertInput) {
  const toConfigured = !!toSafeString(process.env.ALERT_EMAIL_TO);
  if (!toConfigured) return;

  const kind = toSafeString(input.kind).toUpperCase();
  const actor = toSafeString(input.actor);
  const route = toSafeString(input.route);
  if (!kind || !route) return;

  const key = `${kind}::${actor || "anon"}::${route}`;
  if (!shouldSendAlert(key)) return;

  const subject = `[Auth anomaly] ${kind}`;
  const details = input.details && typeof input.details === "object" ? input.details : {};
  const text = [
    "Authentication anomaly detected.",
    "",
    `Kind: ${kind}`,
    `Route: ${route}`,
    `Actor fingerprint: ${actor || "-"}`,
    `Timestamp (UTC): ${new Date().toISOString()}`,
    "",
    "Details:",
    JSON.stringify(details, null, 2),
  ].join("\n");

  const result = await sendOpsAlertEmail({ subject, text });
  appendOpsEvent({
    type: result.sent ? "AUTH_ANOMALY_ALERT_SENT" : "AUTH_ANOMALY_ALERT_FAILED",
    actor: actor || "system",
    route,
    status: result.sent ? 200 : 502,
    details: {
      kind,
      provider: result.provider,
      sent: result.sent,
      error: result.error || null,
    },
  });
}

