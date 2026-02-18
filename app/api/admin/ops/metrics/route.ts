import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";

function startOfDaysAgo(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

export async function GET() {
  const perm = await isAdminMutationAllowed();
  if (!perm.ok) {
    return NextResponse.json({ error: "ADMIN_PERMISSION_REQUIRED", message: perm.reason }, { status: 403 });
  }
  const since7 = startOfDaysAgo(7);
  const since1 = startOfDaysAgo(1);

  const [runs7, assessments7, failed7, assessingNow, done24h] = await Promise.all([
    prisma.submissionExtractionRun.findMany({
      where: { startedAt: { gte: since7 } },
      select: { status: true, overallConfidence: true, startedAt: true, finishedAt: true },
    }),
    prisma.assessment.findMany({
      where: { createdAt: { gte: since7 } },
      select: { id: true, createdAt: true },
    }),
    prisma.submission.count({ where: { status: "FAILED", updatedAt: { gte: since7 } } }),
    prisma.submission.count({ where: { status: "ASSESSING" } }),
    prisma.submission.count({ where: { status: "DONE", updatedAt: { gte: since1 } } }),
  ]);

  const extractionDone = runs7.filter((r) => String(r.status || "").toUpperCase() === "DONE").length;
  const extractionFailed = runs7.filter((r) => String(r.status || "").toUpperCase() === "FAILED").length;
  const extractionNeedsOcr = runs7.filter((r) => String(r.status || "").toUpperCase() === "NEEDS_OCR").length;
  const extractionTotal = Math.max(1, runs7.length);
  const extractionSuccessRate = extractionDone / extractionTotal;

  const durationsMs = runs7
    .map((r) => {
      const s = r.startedAt ? new Date(r.startedAt).getTime() : NaN;
      const f = r.finishedAt ? new Date(r.finishedAt).getTime() : NaN;
      if (!Number.isFinite(s) || !Number.isFinite(f) || f <= s) return null;
      return f - s;
    })
    .filter((n): n is number => Number.isFinite(n));
  durationsMs.sort((a, b) => a - b);
  const medianMs = durationsMs.length ? durationsMs[Math.floor(durationsMs.length / 2)] : 0;

  return NextResponse.json({
    ok: true,
    window: { since7: since7.toISOString(), since1: since1.toISOString() },
    metrics: {
      extraction: {
        totalRuns7d: runs7.length,
        done7d: extractionDone,
        failed7d: extractionFailed,
        needsOcr7d: extractionNeedsOcr,
        successRate7d: Number(extractionSuccessRate.toFixed(4)),
        medianDurationMs7d: medianMs,
      },
      grading: {
        assessmentsCreated7d: assessments7.length,
        submissionsFailed7d: failed7,
        assessingNow,
        submissionsDone24h: done24h,
      },
    },
  });
}
