import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { appendOpsEvent } from "@/lib/ops/eventLog";

type AuthRateLimitState = {
  buckets: Map<string, number[]>;
};

type RateLimitCheckInput = {
  eventType: string;
  actor: string | null;
  limit: number;
  windowMs: number;
};

type RateLimitCheckResult = {
  limited: boolean;
  count: number;
  retryAfterSeconds: number;
};

type RateLimitEventInput = {
  eventType: string;
  actor: string | null;
  windowMs?: number;
  route?: string;
  status?: number;
  details?: Record<string, unknown>;
};

const globalForAuthRateLimit = globalThis as unknown as {
  __authRateLimitState?: AuthRateLimitState;
};

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function getState() {
  if (!globalForAuthRateLimit.__authRateLimitState) {
    globalForAuthRateLimit.__authRateLimitState = { buckets: new Map<string, number[]>() };
  }
  return globalForAuthRateLimit.__authRateLimitState;
}

function normalizeLimit(value: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function normalizeWindowMs(value: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1000) return fallback;
  return Math.floor(n);
}

function memoryKey(eventType: string, actor: string) {
  return `${eventType}::${actor}`;
}

function pruneBucket(tsList: number[], cutoffMs: number) {
  return tsList.filter((ts) => Number.isFinite(ts) && ts > cutoffMs);
}

function countFromMemory(eventType: string, actor: string, windowMs: number) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const key = memoryKey(eventType, actor);
  const state = getState();
  const existing = state.buckets.get(key) || [];
  const next = pruneBucket(existing, cutoff);
  if (next.length) state.buckets.set(key, next);
  else state.buckets.delete(key);
  return next.length;
}

function pushToMemory(eventType: string, actor: string, windowMs: number) {
  const now = Date.now();
  const cutoff = now - windowMs * 2;
  const key = memoryKey(eventType, actor);
  const state = getState();
  const existing = state.buckets.get(key) || [];
  const next = [...pruneBucket(existing, cutoff), now];
  state.buckets.set(key, next);
}

export function buildAuthRateActor(...parts: Array<string | null | undefined>) {
  const tokens = parts.map((p) => toSafeString(p).toLowerCase()).filter(Boolean);
  if (!tokens.length) return null;
  return crypto.createHash("sha256").update(tokens.join("|")).digest("hex").slice(0, 32);
}

export function pickClientIp(req: Request) {
  const forwardedFor = toSafeString(req.headers.get("x-forwarded-for"));
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0];
    if (first) return first.trim();
  }
  return toSafeString(req.headers.get("x-real-ip")) || null;
}

export async function checkAuthRateLimit(input: RateLimitCheckInput): Promise<RateLimitCheckResult> {
  const eventType = toSafeString(input.eventType);
  const actor = toSafeString(input.actor);
  const limit = normalizeLimit(input.limit, 10);
  const windowMs = normalizeWindowMs(input.windowMs, 60 * 60 * 1000);
  if (!eventType || !actor) {
    return { limited: false, count: 0, retryAfterSeconds: 0 };
  }

  const since = new Date(Date.now() - windowMs);
  try {
    const model = (prisma as any)?.opsRuntimeEvent;
    if (!model || typeof model.count !== "function") throw new Error("opsRuntimeEvent unavailable");
    const count = Number(
      (await model.count({
        where: {
          type: eventType,
          actor,
          ts: { gt: since },
        },
      })) || 0
    );
    return {
      limited: count >= limit,
      count,
      retryAfterSeconds: count >= limit ? Math.max(1, Math.ceil(windowMs / 1000)) : 0,
    };
  } catch {
    const count = countFromMemory(eventType, actor, windowMs);
    return {
      limited: count >= limit,
      count,
      retryAfterSeconds: count >= limit ? Math.max(1, Math.ceil(windowMs / 1000)) : 0,
    };
  }
}

export function recordAuthRateEvent(input: RateLimitEventInput) {
  const eventType = toSafeString(input.eventType);
  const actor = toSafeString(input.actor);
  if (!eventType || !actor) return;
  pushToMemory(eventType, actor, normalizeWindowMs(Number(input.windowMs || 0), 60 * 60 * 1000));
  appendOpsEvent({
    type: eventType,
    actor,
    route: input.route,
    status: Number.isFinite(Number(input.status)) ? Number(input.status) : null,
    details: input.details || {},
  });
}
