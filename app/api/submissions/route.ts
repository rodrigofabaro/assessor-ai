import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    return {
      ...s,
      grade: latest?.overallGrade || null,
      overallGrade: latest?.overallGrade || null,
      feedback: latest?.feedbackText || null,
      markedPdfPath: latest?.annotatedPdfPath || null,
      gradedAt: latest?.createdAt || null,
    };
  });

  return NextResponse.json(submissions);
}
