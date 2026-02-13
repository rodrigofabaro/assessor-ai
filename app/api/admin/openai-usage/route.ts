import { NextResponse } from "next/server";
import { readOpenAiUsageHistory } from "@/lib/openai/usageLog";
import { readOpenAiModel } from "@/lib/openai/modelConfig";

export const runtime = "nodejs";

const SECONDS_PER_DAY = 24 * 60 * 60;
const DEFAULT_WINDOW_DAYS = 30;

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };
type OpenAiFetchOk = { ok: true; status: number; json: JsonObject };
type OpenAiFetchError = { ok: false; status: number; message: string };
type OpenAiFetchResult = OpenAiFetchOk | OpenAiFetchError;

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.+-]/g, "");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? (value.filter((v): v is JsonObject => !!v && typeof v === "object") as JsonObject[]) : [];
}

function getErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Unknown error";
  const root = payload as Record<string, unknown>;
  const error = root.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Unknown error";
}

function fromTextMessage(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").replace(/<[^>]+>/g, " ").trim();
  if (!cleaned) return "Unknown error";
  return cleaned.slice(0, 240);
}

async function fetchOpenAi(apiKey: string, path: string, opts?: { useOrgHeader?: boolean }): Promise<OpenAiFetchOk | OpenAiFetchError> {
  const orgId = String(process.env.OPENAI_ORG_ID || "").trim();
  const useOrgHeader = opts?.useOrgHeader !== false;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (useOrgHeader && orgId) headers["OpenAI-Organization"] = orgId;

  const res = await fetch(`https://api.openai.com${path}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  const raw = await res.text();
  let json: JsonObject | null = null;
  try {
    json = raw ? (JSON.parse(raw) as JsonObject) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const parsed = getErrorMessage(json);
    const message = parsed !== "Unknown error" ? parsed : fromTextMessage(raw);
    return {
      ok: false as const,
      status: res.status,
      message,
    };
  }

  return {
    ok: true as const,
    status: res.status,
    json: json ?? {},
  };
}

function isFetchError(result: OpenAiFetchResult): result is OpenAiFetchError {
  return result.ok === false;
}

function parseUsageTotals(payload: JsonObject) {
  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let bucketCount = 0;
  let nonEmptyBucketCount = 0;

  const buckets = toArray(payload.data);
  bucketCount = buckets.length;
  const addUsageRow = (rowLike: unknown) => {
    if (!rowLike || typeof rowLike !== "object") return;
    const rec = rowLike as Record<string, unknown>;
    requests +=
      toNumber(rec.num_model_requests) ||
      toNumber(rec.requests) ||
      toNumber(rec.request_count) ||
      toNumber(rec.num_requests);
    inputTokens +=
      toNumber(rec.input_tokens) +
      toNumber(rec.input_text_tokens) +
      toNumber(rec.input_audio_tokens) +
      toNumber(rec.input_cached_tokens) +
      toNumber(rec.prompt_tokens);
    outputTokens +=
      toNumber(rec.output_tokens) +
      toNumber(rec.output_text_tokens) +
      toNumber(rec.output_audio_tokens) +
      toNumber(rec.completion_tokens);
    totalTokens += toNumber(rec.total_tokens);
  };
  for (const bucket of buckets) {
    const rows = [
      ...toArray(bucket.results),
      ...toArray((bucket as Record<string, unknown>).result),
      ...toArray((bucket as Record<string, unknown>).usage),
    ];
    if (rows.length) nonEmptyBucketCount += 1;
    if (!rows.length) {
      // Some payloads place counters directly on each bucket row.
      addUsageRow(bucket);
      continue;
    }
    for (const row of rows) {
      addUsageRow(row);
    }
  }
  // Top-level fallback
  if (!requests && !inputTokens && !outputTokens && !totalTokens) {
    addUsageRow(payload);
  }

  if (!totalTokens) totalTokens = inputTokens + outputTokens;

  return {
    requests,
    inputTokens,
    outputTokens,
    totalTokens,
    bucketCount,
    nonEmptyBucketCount,
  };
}

function mergeUsageTotals(
  ...items: Array<{ requests: number; inputTokens: number; outputTokens: number; totalTokens: number; bucketCount: number; nonEmptyBucketCount: number }>
) {
  const merged = items.reduce(
    (acc, cur) => ({
      requests: acc.requests + toNumber(cur.requests),
      inputTokens: acc.inputTokens + toNumber(cur.inputTokens),
      outputTokens: acc.outputTokens + toNumber(cur.outputTokens),
      totalTokens: acc.totalTokens + toNumber(cur.totalTokens),
      bucketCount: acc.bucketCount + toNumber(cur.bucketCount),
      nonEmptyBucketCount: acc.nonEmptyBucketCount + toNumber(cur.nonEmptyBucketCount),
    }),
    { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, bucketCount: 0, nonEmptyBucketCount: 0 }
  );
  if (!merged.totalTokens) merged.totalTokens = merged.inputTokens + merged.outputTokens;
  return merged;
}

function parseCostTotals(payload: JsonObject) {
  let amount = 0;
  let currency = "usd";
  let bucketCount = 0;
  let nonEmptyBucketCount = 0;
  const collectAmounts = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) collectAmounts(item);
      return;
    }
    const rec = node as Record<string, unknown>;
    // canonical amount object
    if (typeof rec.value !== "undefined" && Number.isFinite(Number(rec.value))) {
      const v = toNumber(rec.value);
      if (v) amount += v;
      if (typeof rec.currency === "string" && rec.currency.trim()) {
        currency = rec.currency.toLowerCase();
      }
    }
    // common alternates
    const altKeys = ["amount_value", "cost", "total_cost", "amount", "total_amount"];
    for (const k of altKeys) {
      const val = rec[k];
      if (typeof val === "number" || typeof val === "string") {
        const n = toNumber(val);
        if (n) amount += n;
      }
    }
    for (const val of Object.values(rec)) collectAmounts(val);
  };

  const addCostRow = (rowLike: unknown) => {
    if (!rowLike || typeof rowLike !== "object") return;
    const row = rowLike as Record<string, unknown>;
    const amountObj = row.amount;
    if (amountObj && typeof amountObj === "object" && !Array.isArray(amountObj)) {
      const amountRecord = amountObj as Record<string, unknown>;
      const v = toNumber(amountRecord.value);
      if (v) amount += v;
      if (typeof amountRecord.currency === "string" && amountRecord.currency.trim()) {
        currency = amountRecord.currency.toLowerCase();
      }
    } else {
      amount +=
        toNumber(row.amount_value) +
        toNumber(row.cost) +
        toNumber(row.total_cost) +
        toNumber(row.amount) +
        toNumber(row.total_amount);
    }
    collectAmounts(row);
  };

  const buckets = toArray(payload.data);
  bucketCount = buckets.length;
  for (const bucket of buckets) {
    const rows = [
      ...toArray(bucket.results),
      ...toArray((bucket as Record<string, unknown>).result),
      ...toArray((bucket as Record<string, unknown>).costs),
    ];
    if (rows.length) nonEmptyBucketCount += 1;
    if (!rows.length) {
      addCostRow(bucket);
      continue;
    }
    for (const row of rows) {
      addCostRow(row);
    }
  }
  if (!amount) addCostRow(payload);

  return { amount, currency, bucketCount, nonEmptyBucketCount };
}

export async function GET() {
  const keySources = [
    ["OPENAI_ADMIN_KEY", process.env.OPENAI_ADMIN_KEY],
    ["OPENAI_ADMIN_API_KEY", process.env.OPENAI_ADMIN_API_KEY],
    ["OPENAI_ADMIN", process.env.OPENAI_ADMIN],
    ["OPENAI_API_KEY", process.env.OPENAI_API_KEY],
  ] as const;
  const activePair = keySources.find(([, v]) => String(v || "").trim()) || ["", ""] as const;
  const activeKeyName = activePair[0];
  const apiKey = String(activePair[1] || "").trim().replace(/^['"]|['"]$/g, "");
  if (!apiKey) {
    return NextResponse.json(
      {
        configured: false,
        message: "OPENAI_ADMIN_KEY or OPENAI_API_KEY is missing.",
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const start = now - DEFAULT_WINDOW_DAYS * SECONDS_PER_DAY;

  const qp = new URLSearchParams({
    start_time: String(start),
    end_time: String(now),
    bucket_width: "1d",
    limit: String(DEFAULT_WINDOW_DAYS),
  });

  const orgId = String(process.env.OPENAI_ORG_ID || "").trim();
  const useOrgHeader = !!orgId;
  const [modelsRes, usageCompletionsFetch, usageResponsesFetch, costsFetch] = await Promise.all([
    fetchOpenAi(apiKey, "/v1/models"),
    fetchOpenAi(apiKey, `/v1/organization/usage/completions?${qp.toString()}`, { useOrgHeader }),
    fetchOpenAi(apiKey, `/v1/organization/usage/responses?${qp.toString()}`, { useOrgHeader }),
    fetchOpenAi(apiKey, `/v1/organization/costs?${qp.toString()}`, { useOrgHeader }),
  ]);

  let usageCompletions = !isFetchError(usageCompletionsFetch)
    ? parseUsageTotals(usageCompletionsFetch.json)
    : { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, bucketCount: 0, nonEmptyBucketCount: 0 };
  let usageResponses = !isFetchError(usageResponsesFetch)
    ? parseUsageTotals(usageResponsesFetch.json)
    : { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, bucketCount: 0, nonEmptyBucketCount: 0 };

  const usageAvailablePrimary = !isFetchError(usageCompletionsFetch) || !isFetchError(usageResponsesFetch);
  let usage = usageAvailablePrimary
    ? {
        available: true as const,
        ...mergeUsageTotals(usageCompletions, usageResponses),
      }
    : {
        available: false as const,
        status: usageCompletionsFetch.status,
        message: usageCompletionsFetch.message,
      };

  let costs =
    !isFetchError(costsFetch)
      ? {
          available: true as const,
          ...parseCostTotals(costsFetch.json),
        }
      : {
          available: false as const,
          status: costsFetch.status,
          message: costsFetch.message,
        };

  const needsAdminKeyForOrgMetrics =
    (usageCompletionsFetch.ok ? 200 : usageCompletionsFetch.status) === 403 ||
    (usageResponsesFetch.ok ? 200 : usageResponsesFetch.status) === 403 ||
    (costsFetch.ok ? 200 : costsFetch.status) === 403;
  const localUsage = readOpenAiUsageHistory(DEFAULT_WINDOW_DAYS);
  // If org-scoped calls return zeros, retry without OpenAI-Organization header.
  if (useOrgHeader && usage.available && costs.available && usage.totalTokens === 0 && costs.amount === 0) {
    const [fallbackUsageCompletionsFetch, fallbackUsageResponsesFetch, fallbackCostsFetch] = await Promise.all([
      fetchOpenAi(apiKey, `/v1/organization/usage/completions?${qp.toString()}`, { useOrgHeader: false }),
      fetchOpenAi(apiKey, `/v1/organization/usage/responses?${qp.toString()}`, { useOrgHeader: false }),
      fetchOpenAi(apiKey, `/v1/organization/costs?${qp.toString()}`, { useOrgHeader: false }),
    ]);

    if (!isFetchError(fallbackUsageCompletionsFetch)) {
      usageCompletions = parseUsageTotals(fallbackUsageCompletionsFetch.json);
    }
    if (!isFetchError(fallbackUsageResponsesFetch)) {
      usageResponses = parseUsageTotals(fallbackUsageResponsesFetch.json);
    }
    const fallbackUsage = mergeUsageTotals(usageCompletions, usageResponses);
    if (fallbackUsage.totalTokens > 0 || fallbackUsage.requests > 0) {
      usage = { available: true as const, ...fallbackUsage };
    }

    if (!isFetchError(fallbackCostsFetch)) {
      const fallbackCosts = parseCostTotals(fallbackCostsFetch.json);
      if (fallbackCosts.amount > 0) {
        costs = { available: true as const, ...fallbackCosts };
      }
    }
  }

  const usageLooksEmptyFromOrg =
    usage.available && usage.bucketCount > 0 && usage.nonEmptyBucketCount === 0 && usage.totalTokens === 0 && usage.requests === 0;
  const costsLookEmptyFromOrg = costs.available && costs.bucketCount > 0 && costs.nonEmptyBucketCount === 0 && costs.amount === 0;
  if (usageLooksEmptyFromOrg) {
    usage = {
      available: false as const,
      status: 200,
      message: "No organization usage rows returned for this time window/scope.",
    };
  }
  if (costsLookEmptyFromOrg) {
    costs = {
      available: false as const,
      status: 200,
      message: "No organization cost rows returned for this time window/scope.",
    };
  }
  const modelCfg = readOpenAiModel();
  const usingAdminKey = !!String(process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_ADMIN_API_KEY || process.env.OPENAI_ADMIN || "").trim();
  const reachable =
    !isFetchError(modelsRes) ||
    !isFetchError(usageCompletionsFetch) ||
    !isFetchError(usageResponsesFetch) ||
    !isFetchError(costsFetch);
  const connectionStatus =
    (!isFetchError(modelsRes) && modelsRes.status) ||
    (!isFetchError(usageCompletionsFetch) && usageCompletionsFetch.status) ||
    (!isFetchError(usageResponsesFetch) && usageResponsesFetch.status) ||
    (!isFetchError(costsFetch) && costsFetch.status) ||
    modelsRes.status;
  const connectionMessage = !isFetchError(modelsRes)
    ? "Connected to OpenAI API."
    : !isFetchError(usageCompletionsFetch) || !isFetchError(usageResponsesFetch) || !isFetchError(costsFetch)
      ? "Connected via organization metrics endpoints."
      : (!isFetchError(usageResponsesFetch) ? "Connected via responses usage endpoint." : modelsRes.message);

  return NextResponse.json(
    {
      configured: true,
      keyType: usingAdminKey ? "admin" : "standard",
      keySource: activeKeyName || undefined,
      model: modelCfg.model,
      modelSource: modelCfg.source,
      connection: {
        reachable,
        status: connectionStatus,
        message: connectionMessage,
      },
      generatedAt: new Date().toISOString(),
      window: {
        startTime: start,
        endTime: now,
        days: DEFAULT_WINDOW_DAYS,
      },
      hints: {
        needsAdminKeyForOrgMetrics,
        orgMetricsReturnedEmptyRows: usageLooksEmptyFromOrg || costsLookEmptyFromOrg,
      },
      localUsage,
      usage,
      costs,
      debug:
        process.env.NODE_ENV !== "production"
          ? {
              keyFingerprint: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : null,
              orgHeaderApplied: useOrgHeader,
              orgId: orgId || null,
            }
          : undefined,
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
