import { NextResponse } from "next/server";
import { readOpenAiUsageHistory } from "@/lib/openai/usageLog";

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
    const parsed = Number(value);
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

async function fetchOpenAi(apiKey: string, path: string): Promise<OpenAiFetchOk | OpenAiFetchError> {
  const orgId = String(process.env.OPENAI_ORG_ID || "").trim();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (orgId) headers["OpenAI-Organization"] = orgId;

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

  const buckets = toArray(payload.data);
  for (const bucket of buckets) {
    const rows = toArray(bucket.results);
    for (const row of rows) {
      requests += toNumber(row.num_model_requests);
      inputTokens += toNumber(row.input_tokens);
      outputTokens += toNumber(row.output_tokens);
      totalTokens += toNumber(row.total_tokens);
    }
  }

  if (!totalTokens) totalTokens = inputTokens + outputTokens;

  return {
    requests,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function parseCostTotals(payload: JsonObject) {
  let amount = 0;
  let currency = "usd";

  const buckets = toArray(payload.data);
  for (const bucket of buckets) {
    const rows = toArray(bucket.results);
    for (const row of rows) {
      const amountObj = row.amount;
      if (amountObj && typeof amountObj === "object" && !Array.isArray(amountObj)) {
        const amountRecord = amountObj as Record<string, unknown>;
        amount += toNumber(amountRecord.value);
        if (typeof amountRecord.currency === "string" && amountRecord.currency.trim()) {
          currency = amountRecord.currency.toLowerCase();
        }
      } else {
        amount += toNumber((row as Record<string, unknown>).amount_value);
      }
    }
  }

  return { amount, currency };
}

function parseCreditTotals(payload: JsonObject) {
  const root = payload as Record<string, unknown>;
  const totalGranted = toNumber(root.total_granted);
  const totalUsed = toNumber(root.total_used);
  const totalAvailable = toNumber(root.total_available);

  if (totalGranted || totalUsed || totalAvailable) {
    return {
      totalGranted,
      totalUsed,
      totalAvailable,
    };
  }

  return null;
}

export async function GET() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim().replace(/^['"]|['"]$/g, "");
  if (!apiKey) {
    return NextResponse.json(
      {
        configured: false,
        message: "OPENAI_API_KEY is missing.",
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

  const [modelsRes, usageFetch, costsFetch, creditsFetch] = await Promise.all([
    fetchOpenAi(apiKey, "/v1/models"),
    fetchOpenAi(apiKey, `/v1/organization/usage/completions?${qp.toString()}`),
    fetchOpenAi(apiKey, `/v1/organization/costs?${qp.toString()}`),
    fetchOpenAi(apiKey, "/v1/dashboard/billing/credit_grants"),
  ]);

  const usage =
    !isFetchError(usageFetch)
      ? {
          available: true,
          ...parseUsageTotals(usageFetch.json),
        }
      : {
          available: false,
          status: usageFetch.status,
          message: usageFetch.message,
        };

  const costs =
    !isFetchError(costsFetch)
      ? {
          available: true,
          ...parseCostTotals(costsFetch.json),
        }
      : {
          available: false,
          status: costsFetch.status,
          message: costsFetch.message,
        };

  const credits =
    !isFetchError(creditsFetch)
      ? (() => {
          const totals = parseCreditTotals(creditsFetch.json);
          return totals
            ? {
                available: true as const,
                ...totals,
              }
            : {
                available: false as const,
                status: 204,
                message: "No credit data returned.",
              };
        })()
      : {
          available: false as const,
          status: creditsFetch.status,
          message: creditsFetch.message,
        };

  const needsAdminKeyForOrgMetrics =
    (usageFetch.ok ? 200 : usageFetch.status) === 403 || (costsFetch.ok ? 200 : costsFetch.status) === 403;
  const localUsage = readOpenAiUsageHistory(DEFAULT_WINDOW_DAYS);

  return NextResponse.json(
    {
      configured: true,
      connection: {
        reachable: modelsRes.ok,
        status: modelsRes.status,
        message: !isFetchError(modelsRes) ? "Connected to OpenAI API." : modelsRes.message,
      },
      generatedAt: new Date().toISOString(),
      window: {
        startTime: start,
        endTime: now,
        days: DEFAULT_WINDOW_DAYS,
      },
      hints: {
        needsAdminKeyForOrgMetrics,
      },
      localUsage,
      usage,
      costs,
      credits,
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
