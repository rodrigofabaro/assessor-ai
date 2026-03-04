type VerifiedSession = {
  userId: string;
  role: "ADMIN" | "ASSESSOR" | "IV";
  exp: number;
  orgId: string | null;
  isSuperAdmin: boolean;
};

function b64urlDecodeToBytes(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  const raw = atob(normalized + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function b64urlEncodeBytes(bytes: Uint8Array) {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 1) raw += String.fromCharCode(bytes[i]);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlEncodeBytes(new Uint8Array(sig));
}

export async function verifySignedSessionTokenEdge(token: string, secret: string): Promise<VerifiedSession | null> {
  try {
    if (!secret || secret.length < 24) return null;
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const expected = await sign(`${h}.${p}`, secret);
    if (!timingSafeEqual(sig, expected)) return null;
    const payloadText = new TextDecoder().decode(b64urlDecodeToBytes(p));
    const payload = JSON.parse(payloadText) as { uid?: string; role?: string; exp?: number; oid?: string; sa?: number };
    const nowSec = Math.floor(Date.now() / 1000);
    const role = String(payload?.role || "").toUpperCase();
    if (!payload?.uid || !payload?.exp || payload.exp < nowSec) return null;
    if (role !== "ADMIN" && role !== "ASSESSOR" && role !== "IV") return null;
    return {
      userId: String(payload.uid),
      role: role as "ADMIN" | "ASSESSOR" | "IV",
      exp: Number(payload.exp),
      orgId: String(payload.oid || "").trim() || null,
      isSuperAdmin: payload.sa === 1,
    };
  } catch {
    return null;
  }
}
