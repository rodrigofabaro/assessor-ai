import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await params;

  const id = String(submissionId || "");
  if (!id) {
    return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
  }

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      student: true,
      assignment: true,
      extractionRuns: {
        orderBy: { startedAt: "desc" },
        take: 5,
        include: {
          pages: {
            orderBy: { pageNumber: "asc" },
            take: 50,
          },
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ submission });
}
