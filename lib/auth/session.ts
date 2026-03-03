import crypto from "node:crypto";
import type { AppRole } from "@/lib/auth/rbac";

type SessionPayload = {
  uid: string;
  role: AppRole;
  exp: number;
};

const SESSION_COOKIE_NAME = "assessor_session";

function b64urlEncode(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  return Buffer.from(normalized + pad, "base64");
}

function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function getSessionSecret() {
  return String(process.env.AUTH_SESSION_SECRET || "").trim();
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function hasSessionSecret() {
  return getSessionSecret().length >= 24;
}

export function createSignedSessionToken(input: {
  userId: string;
  role: AppRole;
  ttlSeconds?: number;
}) {
  const secret = getSessionSecret();
  if (secret.length < 24) throw new Error("AUTH_SESSION_SECRET is missing or too short.");

  const header = { alg: "HS256", typ: "JWT" };
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    uid: String(input.userId || "").trim(),
    role: input.role,
    exp: nowSec + Math.max(300, Number(input.ttlSeconds || 3600 * 8)),
  };

  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(payload));
  const message = `${h}.${p}`;
  const sig = b64urlEncode(crypto.createHmac("sha256", secret).update(message).digest());
  return `${message}.${sig}`;
}

export function verifySignedSessionToken(token: string) {
  try {
    const secret = getSessionSecret();
    if (secret.length < 24) return null;
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const expected = b64urlEncode(crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest());
    if (!timingSafeEqual(sig, expected)) return null;
    const payload = JSON.parse(b64urlDecode(p).toString("utf8")) as SessionPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload?.uid || !payload?.role || !payload?.exp || payload.exp < nowSec) return null;
    const role = String(payload.role || "").toUpperCase();
    if (role !== "ADMIN" && role !== "ASSESSOR" && role !== "IV") return null;
    return {
      userId: String(payload.uid),
      role: role as AppRole,
      exp: Number(payload.exp),
    };
  } catch {
    return null;
  }
}

