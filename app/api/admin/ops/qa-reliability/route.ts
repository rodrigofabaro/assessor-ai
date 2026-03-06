import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestSession } from "@/lib/auth/requestSession";

type QaAction = "preview" | "commit" | "regrade";

type LatencySummary = {
  sampleSize: number;
  p50Ms: number;
  p95Ms: number;
  avgMs: number;
  maxMs: number;
};

type ActionRollup = {
  action: QaAction;
  runs: number;
  targeted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  failureRate: number;
  batchLatency: LatencySummary;
  perSubmissionLatency: LatencySummary;
};

function canViewQaReliability(session: Awaited<ReturnType<typeof getRequestSession>>) {
  if (!session?.userId) return false;
  if (session.userId.startsWith("env:")) return true;
  return !!session.isSuperAdmin;
}

function emptyLatency(): LatencySummary {
  return { sampleSize: 0, p50Ms: 0, p95Ms: 0, avgMs: 0, maxMs: 0 };
}

function emptyAction(action: QaAction): ActionRollup {
  return {
    action,
    runs: 0,
    targeted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    failureRate: 0,
    batchLatency: emptyLatency(),
    perSubmissionLatency: emptyLatency(),
  };
}

function isOpsRuntimeSchemaCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const message = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") return true;
  return (
    message.includes("opsruntimeevent") &&
    ((message.includes("table") && message.includes("does not exist")) ||
      (message.includes("column") && message.includes("does not exist")) ||
      message.includes("unknown argument"))
  );
}

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function toPositiveInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function percentileMs(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * clampRatio(ratio));
  return sorted[idx] || 0;
}

function summarizeLatency(values: number[]): LatencySummary {
  if (!values.length) return emptyLatency();
  const normalized = values
    .map((value) => toFiniteNumber(value))
    .filter((value): value is number => value !== null && value > 0)
    .map((value) => Math.round(value));
  if (!normalized.length) return emptyLatency();
  const total = normalized.reduce((acc, n) => acc + n, 0);
  return {
    sampleSize: normalized.length,
    p50Ms: percentileMs(normalized, 0.5),
    p95Ms: percentileMs(normalized, 0.95),
    avgMs: Math.round(total / normalized.length),
    maxMs: Math.max(...normalized),
  };
}

function parseAction(details: Record<string, unknown>): QaAction {
  const direct = String((details?.qaReliability as any)?.action || "")
    .trim()
    .toLowerCase();
  if (direct === "preview" || direct === "commit" || direct === "regrade") return direct;
  if (details?.dryRun === true) return "preview";
  if (details?.retryFailedOnly === true || details?.forceRetry === true) return "regrade";
  return "commit";
}

function ratio(value: number, denominator: number) {
  if (!Number.isFinite(value) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number((value / denominator).toFixed(4));
}

export async function GET(req: Request) {
  const session = await getRequestSession();
  if (!canViewQaReliability(session)) {
    return NextResponse.json({ error: "Only SUPER_ADMIN can view QA reliability telemetry." }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.max(10, Math.min(250, Number(url.searchParams.get("limit") || 100)));
  const days = Math.max(1, Math.min(30, Number(url.searchParams.get("days") || 7)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const until = new Date();

  try {
    const rows = await prisma.opsRuntimeEvent.findMany({
      where: {
        type: "BATCH_GRADE_RUN",
        ts: { gte: since },
      },
      orderBy: { ts: "desc" },
      take: 1500,
      select: {
        id: true,
        ts: true,
        status: true,
        details: true,
      },
    });

    const actionRollups = new Map<QaAction, ActionRollup>([
      ["preview", emptyAction("preview")],
      ["commit", emptyAction("commit")],
      ["regrade", emptyAction("regrade")],
    ]);
    const actionBatchLatencies = new Map<QaAction, number[]>([
      ["preview", []],
      ["commit", []],
      ["regrade", []],
    ]);
    const actionPerSubmissionP50 = new Map<QaAction, number[]>([
      ["preview", []],
      ["commit", []],
      ["regrade", []],
    ]);
    const actionPerSubmissionP95 = new Map<QaAction, number[]>([
      ["preview", []],
      ["commit", []],
      ["regrade", []],
    ]);
    const actionPerSubmissionAvg = new Map<QaAction, number[]>([
      ["preview", []],
      ["commit", []],
      ["regrade", []],
    ]);

    const recentRuns = rows.slice(0, limit).map((row) => {
      const details = ((row.details as Record<string, unknown> | null) || {}) as Record<string, unknown>;
      const action = parseAction(details);
      const qa = ((details.qaReliability as Record<string, unknown> | null) || {}) as Record<string, unknown>;
      const perSubmission = ((qa.perSubmissionDurationMs as Record<string, unknown> | null) ||
        {}) as Record<string, unknown>;

      const targeted = toPositiveInt(details.targeted);
      const succeeded = toPositiveInt(details.succeeded);
      const failed = toPositiveInt(details.failed);
      const skipped = toPositiveInt(details.skipped);
      const batchDurationMs = toPositiveInt(qa.batchDurationMs);
      const perSubmissionP50Ms = toPositiveInt(perSubmission.p50);
      const perSubmissionP95Ms = toPositiveInt(perSubmission.p95);
      const perSubmissionAvgMs = toPositiveInt(perSubmission.avg);
      const runFailureRate = ratio(failed, targeted);

      const aggregate = actionRollups.get(action)!;
      aggregate.runs += 1;
      aggregate.targeted += targeted;
      aggregate.succeeded += succeeded;
      aggregate.failed += failed;
      aggregate.skipped += skipped;

      if (batchDurationMs > 0) actionBatchLatencies.get(action)!.push(batchDurationMs);
      if (perSubmissionP50Ms > 0) actionPerSubmissionP50.get(action)!.push(perSubmissionP50Ms);
      if (perSubmissionP95Ms > 0) actionPerSubmissionP95.get(action)!.push(perSubmissionP95Ms);
      if (perSubmissionAvgMs > 0) actionPerSubmissionAvg.get(action)!.push(perSubmissionAvgMs);

      return {
        id: row.id,
        ts: row.ts.toISOString(),
        status: row.status,
        action,
        requestId: String(details.requestId || "").trim() || null,
        targeted,
        succeeded,
        failed,
        skipped,
        failureRate: runFailureRate,
        batchDurationMs,
        perSubmission: {
          p50Ms: perSubmissionP50Ms,
          p95Ms: perSubmissionP95Ms,
          avgMs: perSubmissionAvgMs,
          sampleSize: toPositiveInt(perSubmission.sampleSize),
        },
      };
    });

    for (const action of ["preview", "commit", "regrade"] as const) {
      const aggregate = actionRollups.get(action)!;
      aggregate.failureRate = ratio(aggregate.failed, aggregate.targeted);
      aggregate.batchLatency = summarizeLatency(actionBatchLatencies.get(action)!);

      const p50Summary = summarizeLatency(actionPerSubmissionP50.get(action)!);
      const p95Summary = summarizeLatency(actionPerSubmissionP95.get(action)!);
      const avgSummary = summarizeLatency(actionPerSubmissionAvg.get(action)!);
      aggregate.perSubmissionLatency = {
        sampleSize: Math.max(p50Summary.sampleSize, p95Summary.sampleSize, avgSummary.sampleSize),
        p50Ms: p50Summary.p50Ms || avgSummary.p50Ms,
        p95Ms: p95Summary.p95Ms || avgSummary.p95Ms,
        avgMs: avgSummary.avgMs,
        maxMs: Math.max(p50Summary.maxMs, p95Summary.maxMs, avgSummary.maxMs),
      };
    }

    const rollupList = (["preview", "commit", "regrade"] as const).map((action) => actionRollups.get(action)!);
    const totalRuns = rollupList.reduce((acc, row) => acc + row.runs, 0);
    const totalTargeted = rollupList.reduce((acc, row) => acc + row.targeted, 0);
    const totalFailed = rollupList.reduce((acc, row) => acc + row.failed, 0);
    const gradingRuns = actionRollups.get("commit")!.runs + actionRollups.get("regrade")!.runs;

    return NextResponse.json({
      ok: true,
      window: {
        days,
        since: since.toISOString(),
        until: until.toISOString(),
      },
      summary: {
        totalRuns,
        previewRuns: actionRollups.get("preview")!.runs,
        commitRuns: actionRollups.get("commit")!.runs,
        regradeRuns: actionRollups.get("regrade")!.runs,
        targetedTotal: totalTargeted,
        failedTotal: totalFailed,
        retryRate: ratio(actionRollups.get("regrade")!.runs, gradingRuns),
        failureRate: ratio(totalFailed, totalTargeted),
      },
      byAction: rollupList,
      recentRuns,
    });
  } catch (error) {
    if (isOpsRuntimeSchemaCompatError(error)) {
      return NextResponse.json({
        ok: true,
        window: {
          days,
          since: since.toISOString(),
          until: until.toISOString(),
        },
        summary: {
          totalRuns: 0,
          previewRuns: 0,
          commitRuns: 0,
          regradeRuns: 0,
          targetedTotal: 0,
          failedTotal: 0,
          retryRate: 0,
          failureRate: 0,
        },
        byAction: [emptyAction("preview"), emptyAction("commit"), emptyAction("regrade")],
        recentRuns: [],
        warning:
          "QA reliability telemetry table is not available yet in this environment. Run database migrations.",
        code: "OPS_RUNTIME_SCHEMA_MISSING",
      });
    }
    return NextResponse.json({ error: "Failed to load QA reliability telemetry." }, { status: 500 });
  }
}
