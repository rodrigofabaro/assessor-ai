import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveAutomationState } from "@/lib/submissions/automation";
import { computeExtractionQuality } from "@/lib/submissions/extractionQuality";

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
        },
      },
    },
  });

  const submissions = rows.map((s) => {
    const latest = s.assessments?.[0] || null;
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
      feedback: latest?.feedbackText || null,
      markedPdfPath: latest?.annotatedPdfPath || null,
      extractionQuality,
    });

    return {
      ...s,
      grade: latest?.overallGrade || null,
      overallGrade: latest?.overallGrade || null,
      feedback: latest?.feedbackText || null,
      markedPdfPath: latest?.annotatedPdfPath || null,
      gradedAt: latest?.createdAt || null,
      automationState: automation.state,
      automationReason: automation.reason,
      automationExceptionCode: automation.exceptionCode,
      automationRecommendedAction: automation.recommendedAction,
      extractionQuality,
    };
  });

  return NextResponse.json(submissions);
}
