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
      assessments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          overallGrade: true,
          annotatedPdfPath: true,
        },
      },
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

// PATCH /api/submissions/[submissionId]
// Supports linking a submission to a student (audit-friendly: records linkedAt/by)
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
    if (!studentId) {
      return NextResponse.json({ error: "studentId is required." }, { status: 400 });
    }

    // Ensure student exists (clean 400 instead of silent foreign-key style crash)
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        studentId,
        studentLinkedAt: new Date(),
        studentLinkedBy: "manual",
      },
      select: { id: true, studentId: true, studentLinkedAt: true, studentLinkedBy: true },
    });

    return NextResponse.json({ ok: true, submission: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Update failed" }, { status: 500 });
  }
}
