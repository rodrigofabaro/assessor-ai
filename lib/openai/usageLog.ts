import fs from "node:fs";
import path from "node:path";

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
};

const LOG_FILE = path.join(process.cwd(), ".openai-usage-log.jsonl");

function toInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function dayKeyFromTs(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
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
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(event)}\n`, { encoding: "utf8" });
  } catch {
    // telemetry must never break runtime behavior
  }
}

export function readOpenAiUsageHistory(days: number) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - Math.max(1, days) * 24 * 60 * 60;
  const totals: UsageTotals = { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const byDay = new Map<string, UsageTotals>();

  try {
    if (!fs.existsSync(LOG_FILE)) {
      return { available: false as const, totals, days: [] as Array<{ date: string } & UsageTotals> };
    }

    const raw = fs.readFileSync(LOG_FILE, "utf8");
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      let row: UsageLogEvent | null = null;
      try {
        row = JSON.parse(line) as UsageLogEvent;
      } catch {
        row = null;
      }
      if (!row || !Number.isFinite(row.ts) || row.ts < start) continue;

      totals.requests += 1;
      totals.inputTokens += toInt(row.inputTokens);
      totals.outputTokens += toInt(row.outputTokens);
      totals.totalTokens += toInt(row.totalTokens);

      const key = dayKeyFromTs(row.ts);
      const day = byDay.get(key) || { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      day.requests += 1;
      day.inputTokens += toInt(row.inputTokens);
      day.outputTokens += toInt(row.outputTokens);
      day.totalTokens += toInt(row.totalTokens);
      byDay.set(key, day);
    }

    const daysOut = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, agg]) => ({ date, ...agg }));

    return { available: true as const, totals, days: daysOut };
  } catch {
    return { available: false as const, totals, days: [] as Array<{ date: string } & UsageTotals> };
  }
}

