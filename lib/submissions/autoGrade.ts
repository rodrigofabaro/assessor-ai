import { prisma } from "@/lib/prisma";
import { deriveAutomationState } from "@/lib/submissions/automation";
import { computeExtractionQuality } from "@/lib/submissions/extractionQuality";
import { enqueueSubmissionAutomationJob, triggerSubmissionAutomationRunner } from "@/lib/submissions/automationQueue";

function envBool(name: string, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function hasBriefHardValidationOk(sourceMeta: unknown) {
  const meta = sourceMeta && typeof sourceMeta === "object" ? (sourceMeta as any) : {};
  const hard = meta?.hardValidation && typeof meta.hardValidation === "object" ? meta.hardValidation : null;
  return hard?.ok === true;
}

export async function triggerAutoGradeIfAutoReady(submissionId: string, requestUrl: string) {
  const enabled = envBool("SUBMISSION_AUTO_GRADE_ON_EXTRACT", true);
  if (!enabled) return { queued: false, reason: "disabled" as const };
  const strictReferenceReady = envBool("SUBMISSION_AUTO_GRADE_REQUIRE_VALIDATED_BRIEF", true);

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
          assignmentBrief: {
            select: {
              id: true,
              lockedAt: true,
              briefDocument: {
                select: {
                  id: true,
                  lockedAt: true,
                  sourceMeta: true,
                },
              },
            },
          },
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
  if (strictReferenceReady) {
    const brief = submission.assignment.assignmentBrief;
    const briefDoc = brief?.briefDocument;
    if (!brief?.lockedAt) return { queued: false, reason: "brief-not-locked" as const };
    if (!briefDoc?.lockedAt) return { queued: false, reason: "brief-document-not-locked" as const };
    if (!hasBriefHardValidationOk(briefDoc?.sourceMeta)) {
      return { queued: false, reason: "brief-hard-validation-not-ok" as const };
    }
  }

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
    assignmentBriefId: submission.assignment?.assignmentBriefId ?? null,
    extractedText: null,
    _count: submission._count,
    extractionQuality,
  });

  if (automation.state !== "AUTO_READY") {
    return { queued: false, reason: "not-auto-ready" as const, automationState: automation.state };
  }

  const { job, deduped } = await enqueueSubmissionAutomationJob({
    submissionId,
    type: "GRADE",
    createdBy: "auto_ready",
    payload: { source: "auto_ready" },
    priority: 120,
    maxAttempts: 2,
  });
  const res = await triggerSubmissionAutomationRunner(requestUrl);
  return {
    queued: true,
    reason: deduped ? ("queued" as const) : ("queued" as const),
    status: res.status,
    jobId: job.id,
  };
}
