import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveAutomationState } from "@/lib/submissions/automation";

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
    },
  });

  const submissions = rows.map((s) => {
    const latest = s.assessments?.[0] || null;
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
    };
  });

  return NextResponse.json(submissions);
}
