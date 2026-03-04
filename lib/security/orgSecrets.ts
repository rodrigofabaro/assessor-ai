import crypto from "node:crypto";

const ENC_PREFIX = "v1";

function getEncryptionSecret() {
  const direct = String(process.env.ORG_SECRET_ENCRYPTION_KEY || "").trim();
  if (direct.length >= 32) return direct;
  const fallback = String(process.env.AUTH_SESSION_SECRET || "").trim();
  if (fallback.length >= 32) return fallback;
  return "";
}

function toKey(secret: string) {
  return crypto.createHash("sha256").update(secret).digest();
}

function toB64Url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64Url(input: string) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  return Buffer.from(normalized + pad, "base64");
}

export function canEncryptOrgSecrets() {
  return getEncryptionSecret().length >= 32;
}

export function encryptOrganizationSecret(value: string) {
  const secret = getEncryptionSecret();
  if (secret.length < 32) {
    throw new Error("ORG_SECRET_ENCRYPTION_KEY (or 32+ char AUTH_SESSION_SECRET fallback) is required.");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", toKey(secret), iv);
  const enc = Buffer.concat([cipher.update(String(value || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}.${toB64Url(iv)}.${toB64Url(tag)}.${toB64Url(enc)}`;
}

export function decryptOrganizationSecret(payload: string) {
  const secret = getEncryptionSecret();
  if (secret.length < 32) {
    throw new Error("ORG_SECRET_ENCRYPTION_KEY (or 32+ char AUTH_SESSION_SECRET fallback) is required.");
  }
  const [prefix, ivPart, tagPart, bodyPart] = String(payload || "").split(".");
  if (prefix !== ENC_PREFIX || !ivPart || !tagPart || !bodyPart) {
    throw new Error("Invalid encrypted secret payload.");
  }
  const iv = fromB64Url(ivPart);
  const tag = fromB64Url(tagPart);
  const body = fromB64Url(bodyPart);
  const decipher = crypto.createDecipheriv("aes-256-gcm", toKey(secret), iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(body), decipher.final()]);
  return out.toString("utf8");
}
