import crypto from "node:crypto";

export type ResendWebhookHeaders = {
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
};

export type ParsedResendLifecycleEvent = {
  eventType: string;
  messageId: string | null;
  recipient: string | null;
  recipientDomain: string | null;
  happenedAt: Date | null;
  payload: Record<string, unknown>;
};

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return toSafeString(value).toLowerCase();
}

function pickRecipientDomain(email: string | null | undefined) {
  const clean = lower(email);
  if (!clean.includes("@")) return null;
  const domain = clean.split("@")[1];
  return toSafeString(domain).toLowerCase() || null;
}

function parseJsonRecord(input: string) {
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickString(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toSafeString(obj[key]);
    if (value) return value;
  }
  return "";
}

function pickDate(input: unknown) {
  const raw = toSafeString(input);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function pickMessageId(payload: Record<string, unknown>, data: Record<string, unknown>) {
  return (
    pickString(data, ["email_id", "message_id", "messageId", "id"]) ||
    pickString(payload, ["email_id", "message_id", "messageId", "id"]) ||
    ""
  );
}

function pickRecipient(payload: Record<string, unknown>, data: Record<string, unknown>) {
  const candidates: unknown[] = [
    data.to,
    data.recipient,
    (data as { email?: unknown }).email,
    payload.to,
    payload.recipient,
    (payload as { email?: unknown }).email,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const first = toSafeString(candidate[0]);
      if (first) return first.toLowerCase();
      continue;
    }
    const value = toSafeString(candidate);
    if (value) return value.toLowerCase();
  }
  return "";
}

function pickEventType(payload: Record<string, unknown>, data: Record<string, unknown>) {
  return (
    lower(payload.type) ||
    lower(data.type) ||
    lower(payload.event) ||
    lower(data.event) ||
    lower(payload.name) ||
    lower(data.name)
  );
}

export function classifyResendLifecycle(eventType: string) {
  const value = lower(eventType);
  if (!value) return "other";
  if (value.includes("bounced") || value.includes("bounce")) return "bounced";
  if (value.includes("complained") || value.includes("complaint")) return "complained";
  if (value.includes("opened") || value.includes("open")) return "opened";
  if (value.includes("clicked") || value.includes("click")) return "clicked";
  if (value.includes("delivered") || value.includes("delivery")) return "delivered";
  if (value.includes("sent")) return "sent";
  return "other";
}

function decodeSvixSecret(secret: string) {
  const raw = toSafeString(secret);
  const withoutPrefix = raw.startsWith("whsec_") ? raw.slice(6) : raw;
  return Buffer.from(withoutPrefix, "base64");
}

function parseSvixSignatures(rawHeader: string) {
  const raw = toSafeString(rawHeader);
  if (!raw) return [] as string[];
  const candidates: string[] = [];

  for (const token of raw.split(" ").map((part) => part.trim()).filter(Boolean)) {
    if (token.includes(",")) {
      const [version, signature] = token.split(",", 2).map((part) => part.trim());
      if (version === "v1" && signature) candidates.push(signature);
    }
  }

  for (const token of raw.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (token.startsWith("v1=")) {
      const sig = token.slice(3).trim();
      if (sig) candidates.push(sig);
    }
  }

  return Array.from(new Set(candidates));
}

function safeCompareBase64(a: string, b: string) {
  const lhs = Buffer.from(toSafeString(a), "utf8");
  const rhs = Buffer.from(toSafeString(b), "utf8");
  if (lhs.length !== rhs.length) return false;
  try {
    return crypto.timingSafeEqual(lhs, rhs);
  } catch {
    return false;
  }
}

export function verifyResendSvixSignature(input: {
  body: string;
  secret: string;
  headers: ResendWebhookHeaders;
  toleranceSeconds?: number;
}) {
  const secret = toSafeString(input.secret);
  const svixId = toSafeString(input.headers.svixId);
  const svixTimestamp = toSafeString(input.headers.svixTimestamp);
  const svixSignature = toSafeString(input.headers.svixSignature);
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;

  const timestamp = Number(svixTimestamp);
  if (!Number.isFinite(timestamp)) return false;
  const toleranceSeconds = Math.max(30, Number(input.toleranceSeconds || 300));
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const payloadToSign = `${svixId}.${svixTimestamp}.${input.body}`;
  const expected = crypto.createHmac("sha256", decodeSvixSecret(secret)).update(payloadToSign).digest("base64");
  const signatures = parseSvixSignatures(svixSignature);
  return signatures.some((sig) => safeCompareBase64(sig, expected));
}

export function parseResendLifecycleEvent(rawBody: string): ParsedResendLifecycleEvent | null {
  const payload = parseJsonRecord(rawBody);
  if (!payload) return null;
  const dataRaw = payload.data;
  const data =
    dataRaw && typeof dataRaw === "object" && !Array.isArray(dataRaw)
      ? (dataRaw as Record<string, unknown>)
      : payload;

  const eventType = pickEventType(payload, data);
  if (!eventType) return null;

  const recipient = pickRecipient(payload, data) || null;
  const messageId = pickMessageId(payload, data) || null;
  const happenedAt = pickDate(data.created_at || payload.created_at || data.timestamp || payload.timestamp);

  return {
    eventType,
    messageId,
    recipient,
    recipientDomain: pickRecipientDomain(recipient),
    happenedAt,
    payload,
  };
}

export function fallbackWebhookEventId(rawBody: string) {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

