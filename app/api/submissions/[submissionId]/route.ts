import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await ctx.params;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      student: true,
      assignment: true,
      extractionRuns: {
        orderBy: { startedAt: "desc" },
        include: {
          pages: { orderBy: { pageNumber: "asc" } },
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  return NextResponse.json({ submission });
}
