import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const submissions = await prisma.submission.findMany({
    orderBy: { uploadedAt: "desc" },
    include: {
      student: true,
      assignment: true,
      _count: {
        select: {
          extractionRuns: true,
          assessments: true,
        },
      },
    },
  });

  return NextResponse.json(submissions);
}
