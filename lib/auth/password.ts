import crypto from "node:crypto";

const HASH_PREFIX = "pbkdf2_sha256";
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*_-";

function toSafeString(value: unknown) {
  return String(value || "");
}

function timingSafeEqualHex(aHex: string, bHex: string) {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function normalizeLoginEmail(value: unknown) {
  return toSafeString(value).trim().toLowerCase();
}

export function hashPassword(password: string) {
  const raw = toSafeString(password);
  if (raw.length < 10) {
    throw new Error("Password must be at least 10 characters.");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.pbkdf2Sync(raw, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `${HASH_PREFIX}$${ITERATIONS}$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined) {
  const raw = toSafeString(password);
  const packed = toSafeString(storedHash).trim();
  if (!raw || !packed) return false;

  const [prefix, iterRaw, salt, hashHex] = packed.split("$");
  if (prefix !== HASH_PREFIX || !iterRaw || !salt || !hashHex) return false;

  const iterations = Number(iterRaw);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  const derived = crypto.pbkdf2Sync(raw, salt, iterations, KEY_LENGTH, DIGEST).toString("hex");
  return timingSafeEqualHex(derived, hashHex);
}

export function generateRandomPassword(length = 20) {
  const size = Math.max(12, Math.min(64, Number(length) || 20));
  let out = "";
  for (let i = 0; i < size; i += 1) {
    out += PASSWORD_ALPHABET[crypto.randomInt(0, PASSWORD_ALPHABET.length)];
  }
  return out;
}
