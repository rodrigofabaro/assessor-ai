import { prisma } from "@/lib/prisma";
import { deriveAutomationState } from "@/lib/submissions/automation";
import { computeExtractionQuality } from "@/lib/submissions/extractionQuality";

function envBool(name: string, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export async function triggerAutoGradeIfAutoReady(submissionId: string, requestUrl: string) {
  const enabled = envBool("SUBMISSION_AUTO_GRADE_ON_EXTRACT", true);
  if (!enabled) return { queued: false, reason: "disabled" as const };

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      studentId: true,
      assignmentId: true,
      assignment: {
        select: {
          assignmentBriefId: true,
        },
      },
      _count: { select: { assessments: true } },
      extractionRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          status: true,
          overallConfidence: true,
          pageCount: true,
          warnings: true,
          sourceMeta: true,
        },
      },
    },
  });

  if (!submission) return { queued: false, reason: "not-found" as const };
  if (Number(submission?._count?.assessments || 0) > 0) return { queued: false, reason: "already-graded" as const };
  if (!submission?.assignment?.assignmentBriefId) return { queued: false, reason: "missing-brief-link" as const };

  const latestRun = submission.extractionRuns?.[0] || null;
  const extractionQuality = computeExtractionQuality({
    submissionStatus: submission.status,
    extractedText: null,
    latestRun: latestRun
      ? {
          status: latestRun.status,
          overallConfidence: latestRun.overallConfidence,
          pageCount: latestRun.pageCount,
          warnings: latestRun.warnings,
          sourceMeta: latestRun.sourceMeta,
        }
      : null,
  });

  const automation = deriveAutomationState({
    status: submission.status,
    studentId: submission.studentId,
    assignmentId: submission.assignmentId,
    extractedText: null,
    _count: submission._count,
    extractionQuality,
  });

  if (automation.state !== "AUTO_READY") {
    return { queued: false, reason: "not-auto-ready" as const, automationState: automation.state };
  }

  const gradeUrl = new URL(`/api/submissions/${submissionId}/grade`, requestUrl);
  const res = await fetch(gradeUrl.toString(), { method: "POST", cache: "no-store" });
  return {
    queued: res.ok,
    reason: res.ok ? ("queued" as const) : ("grade-request-failed" as const),
    status: res.status,
  };
}
