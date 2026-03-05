import crypto from "node:crypto";

const DEFAULT_RECOVERY_TTL_MINUTES = 15;

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

export function getPasswordRecoveryTtlMinutes() {
  const raw = Number(process.env.AUTH_PASSWORD_RECOVERY_TTL_MINUTES || DEFAULT_RECOVERY_TTL_MINUTES);
  if (!Number.isFinite(raw)) return DEFAULT_RECOVERY_TTL_MINUTES;
  return Math.max(5, Math.min(60, Math.floor(raw)));
}

export function generatePasswordRecoveryToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashPasswordRecoveryToken(token: string) {
  const pepper = toSafeString(process.env.RESET_TOKEN_PEPPER);
  if (!pepper) throw new Error("RESET_TOKEN_PEPPER is not configured.");
  return crypto.createHmac("sha256", pepper).update(toSafeString(token)).digest("hex");
}

export function resolveAuthAppOrigin(request: Request) {
  const configured = toSafeString(process.env.AUTH_APP_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN || process.env.APP_ORIGIN);
  if (configured) return configured.replace(/\/+$/, "");

  const vercelUrl = toSafeString(process.env.VERCEL_URL);
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;

  try {
    const origin = new URL(request.url).origin;
    return origin.replace(/\/+$/, "");
  } catch {
    return "https://www.assessor-ai.co.uk";
  }
}

export function buildPasswordRecoveryUrl(input: {
  request: Request;
  resetId: string;
  token: string;
}) {
  const origin = resolveAuthAppOrigin(input.request);
  const rid = encodeURIComponent(toSafeString(input.resetId));
  const token = encodeURIComponent(toSafeString(input.token));
  return `${origin}/auth/reset?rid=${rid}&t=${token}`;
}
