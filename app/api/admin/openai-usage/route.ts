import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SECONDS_PER_DAY = 24 * 60 * 60;
const DEFAULT_WINDOW_DAYS = 30;

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

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

async function fetchOpenAi(apiKey: string, path: string) {
  const res = await fetch(`https://api.openai.com${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  let json: JsonObject | null = null;
  try {
    json = (await res.json()) as JsonObject;
  } catch {
    json = null;
  }

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      message: getErrorMessage(json),
    };
  }

  return {
    ok: true as const,
    status: res.status,
    json: json ?? {},
  };
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

  const [usageRes, costsRes, creditRes] = await Promise.all([
    fetchOpenAi(apiKey, `/v1/organization/usage/completions?${qp.toString()}`),
    fetchOpenAi(apiKey, `/v1/organization/costs?${qp.toString()}`),
    fetchOpenAi(apiKey, "/v1/dashboard/billing/credit_grants"),
  ]);

  const usage =
    usageRes.ok
      ? {
          available: true,
          ...parseUsageTotals(usageRes.json),
        }
      : {
          available: false,
          status: usageRes.status,
          message: usageRes.message,
        };

  const costs =
    costsRes.ok
      ? {
          available: true,
          ...parseCostTotals(costsRes.json),
        }
      : {
          available: false,
          status: costsRes.status,
          message: costsRes.message,
        };

  const credits =
    creditRes.ok
      ? (() => {
          const totals = parseCreditTotals(creditRes.json);
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
          status: creditRes.status,
          message: creditRes.message,
        };

  return NextResponse.json(
    {
      configured: true,
      generatedAt: new Date().toISOString(),
      window: {
        startTime: start,
        endTime: now,
        days: DEFAULT_WINDOW_DAYS,
      },
      usage,
      costs,
      credits,
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
