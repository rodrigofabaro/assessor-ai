import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveAutomationState } from "@/lib/submissions/automation";
import { computeExtractionQuality } from "@/lib/submissions/extractionQuality";
import { sanitizeStudentFeedbackText } from "@/lib/grading/studentFeedback";

export async function GET() {
  const rows = await prisma.submission.findMany({
    orderBy: { uploadedAt: "desc" },
    include: {
      student: true,
      assignment: true,
      assessments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          overallGrade: true,
          feedbackText: true,
          annotatedPdfPath: true,
          resultJson: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          extractionRuns: true,
          assessments: true,
        },
      },
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

  const submissions = rows.map((s) => {
    const latest = s.assessments?.[0] || null;
    const feedbackText = sanitizeStudentFeedbackText(latest?.feedbackText || null) || null;
    const latestRun = s.extractionRuns?.[0] || null;
    const extractionQuality = computeExtractionQuality({
      submissionStatus: s.status,
      extractedText: s.extractedText,
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
      status: s.status,
      studentId: s.studentId,
      assignmentId: s.assignmentId,
      extractedText: s.extractedText,
      _count: s._count,
      grade: latest?.overallGrade || null,
      overallGrade: latest?.overallGrade || null,
      feedback: feedbackText,
      markedPdfPath: latest?.annotatedPdfPath || null,
      extractionQuality,
    });

    return {
      ...s,
      grade: latest?.overallGrade || null,
      overallGrade: latest?.overallGrade || null,
      feedback: feedbackText,
      markedPdfPath: latest?.annotatedPdfPath || null,
      gradedAt: latest?.createdAt || null,
      assessmentActor: String((latest?.resultJson as any)?.gradedBy || "").trim() || null,
      extractionMode: String((latestRun?.sourceMeta as any)?.extractionMode || "").toUpperCase() || null,
      coverReady: Boolean((latestRun?.sourceMeta as any)?.coverReady),
      automationState: automation.state,
      automationReason: automation.reason,
      automationExceptionCode: automation.exceptionCode,
      automationRecommendedAction: automation.recommendedAction,
      extractionQuality,
    };
  });

  return NextResponse.json(submissions);
}
