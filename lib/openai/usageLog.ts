import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

type UsageLogEvent = {
  ts: number;
  model: string;
  op: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type UsageTotals = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

const LOG_FILE = path.join(process.cwd(), ".openai-usage-log.jsonl");
const PRICES_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 5, output: 15 },
  "gpt-5-mini": { input: 0.25, output: 2 },
};

function toInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function dayKeyFromTs(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function estimateUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICES_USD_PER_1M[String(model || "").trim()];
  if (!pricing) return 0;
  const inCost = (toInt(inputTokens) / 1_000_000) * pricing.input;
  const outCost = (toInt(outputTokens) / 1_000_000) * pricing.output;
  return inCost + outCost;
}

export function recordOpenAiUsage(input: {
  model: string;
  op: string;
  usage: unknown;
}) {
  try {
    const usage = (input.usage || {}) as Record<string, unknown>;
    const inputTokens = toInt(usage.input_tokens ?? usage.prompt_tokens);
    const outputTokens = toInt(usage.output_tokens ?? usage.completion_tokens);
    const totalTokens = toInt(usage.total_tokens) || inputTokens + outputTokens;
    const event: UsageLogEvent = {
      ts: Math.floor(Date.now() / 1000),
      model: String(input.model || "unknown"),
      op: String(input.op || "unknown"),
      inputTokens,
      outputTokens,
      totalTokens,
    };
    const appendFallback = () => fs.appendFileSync(LOG_FILE, `${JSON.stringify(event)}\n`, { encoding: "utf8" });
    const dbModel = (prisma as any)?.openAiUsageEvent;
    if (!dbModel || typeof dbModel.create !== "function") {
      appendFallback();
      return;
    }
    void dbModel
      .create({
        data: {
          ts: new Date(event.ts * 1000),
          model: event.model,
          op: event.op,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          totalTokens: event.totalTokens,
        },
      })
      .catch(() => appendFallback());
  } catch {
    // telemetry must never break runtime behavior
  }
}

function aggregateUsageRows(rows: UsageLogEvent[], start: number) {
  const totals: UsageTotals = { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
  const byDay = new Map<string, UsageTotals>();
  const recentEvents: Array<UsageLogEvent & { estimatedCostUsd: number }> = [];

  for (const row of rows) {
    if (!row || !Number.isFinite(row.ts) || row.ts < start) continue;

    totals.requests += 1;
    totals.inputTokens += toInt(row.inputTokens);
    totals.outputTokens += toInt(row.outputTokens);
    totals.totalTokens += toInt(row.totalTokens);
    totals.estimatedCostUsd += estimateUsd(row.model, row.inputTokens, row.outputTokens);

    const key = dayKeyFromTs(row.ts);
    const day = byDay.get(key) || { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
    day.requests += 1;
    day.inputTokens += toInt(row.inputTokens);
    day.outputTokens += toInt(row.outputTokens);
    day.totalTokens += toInt(row.totalTokens);
    day.estimatedCostUsd += estimateUsd(row.model, row.inputTokens, row.outputTokens);
    byDay.set(key, day);

    recentEvents.push({
      ...row,
      estimatedCostUsd: estimateUsd(row.model, row.inputTokens, row.outputTokens),
    });
  }

  const daysOut = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, agg]) => ({ date, ...agg }));

  const roundedTotals = {
    ...totals,
    estimatedCostUsd: Math.round((totals.estimatedCostUsd + Number.EPSILON) * 10000) / 10000,
  };
  const roundedDays = daysOut.map((d) => ({
    ...d,
    estimatedCostUsd: Math.round((d.estimatedCostUsd + Number.EPSILON) * 10000) / 10000,
  }));
  const topRecent = recentEvents
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 50)
    .map((e) => ({ ...e, estimatedCostUsd: Math.round((e.estimatedCostUsd + Number.EPSILON) * 100000) / 100000 }));

  return { roundedTotals, roundedDays, topRecent, hasRows: totals.requests > 0 };
}

export async function readOpenAiUsageHistory(days: number) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - Math.max(1, days) * 24 * 60 * 60;
  const totals: UsageTotals = { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };

  // DB primary read.
  try {
    const dbModel = (prisma as any)?.openAiUsageEvent;
    if (dbModel && typeof dbModel.findMany === "function") {
      const rows = await dbModel.findMany({
        where: { ts: { gte: new Date(start * 1000) } },
        orderBy: { ts: "desc" },
        take: 5000,
        select: {
          ts: true,
          model: true,
          op: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
        },
      });

      const normalized: UsageLogEvent[] = (Array.isArray(rows) ? rows : []).map((row: any) => ({
        ts: Math.floor(new Date(row.ts).getTime() / 1000),
        model: String(row.model || "unknown"),
        op: String(row.op || "unknown"),
        inputTokens: toInt(row.inputTokens),
        outputTokens: toInt(row.outputTokens),
        totalTokens: toInt(row.totalTokens),
      }));
      const agg = aggregateUsageRows(normalized, start);
      if (agg.hasRows) {
        return {
          available: true as const,
          totals: agg.roundedTotals,
          days: agg.roundedDays,
          recentEvents: agg.topRecent,
          source: "db" as const,
        };
      }
    }
  } catch {
    // fallback to file log below
  }

  try {
    if (!fs.existsSync(LOG_FILE)) {
      return {
        available: false as const,
        totals,
        days: [] as Array<{ date: string } & UsageTotals>,
        recentEvents: [] as Array<UsageLogEvent & { estimatedCostUsd: number }>,
        source: "none" as const,
      };
    }

    const raw = fs.readFileSync(LOG_FILE, "utf8");
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    const parsedRows: UsageLogEvent[] = [];
    for (const line of lines) {
      let row: UsageLogEvent | null = null;
      try {
        row = JSON.parse(line) as UsageLogEvent;
      } catch {
        row = null;
      }
      if (!row) continue;
      parsedRows.push(row);
    }
    const agg = aggregateUsageRows(parsedRows, start);
    return {
      available: agg.hasRows as true | false,
      totals: agg.roundedTotals,
      days: agg.roundedDays,
      recentEvents: agg.topRecent,
      source: "file" as const,
    };
  } catch {
    return {
      available: false as const,
      totals,
      days: [] as Array<{ date: string } & UsageTotals>,
      recentEvents: [] as Array<UsageLogEvent & { estimatedCostUsd: number }>,
      source: "none" as const,
    };
  }
}
