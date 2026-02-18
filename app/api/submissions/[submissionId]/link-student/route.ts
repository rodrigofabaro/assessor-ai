import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";

export async function POST(req: Request, ctx: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const studentId = String(body?.studentId || "");
  const actor = await getCurrentAuditActor(body?.actor);

  if (!studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  const sub = await prisma.submission.findUnique({ where: { id: submissionId }, select: { studentId: true } });
  if (!sub) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      studentId,
      studentLinkedAt: new Date(),
      studentLinkedBy: actor,
    },
  });

  await prisma.submissionAuditEvent.create({
    data: {
      submissionId,
      type: "STUDENT_LINKED",
      actor,
      meta: { studentId, previousStudentId: sub.studentId },
    },
  });

  // Best-effort auto-grade when the submission becomes fully linked after extraction.
  try {
    const autoGradeEnabled = ["1", "true", "yes", "on"].includes(
      String(process.env.SUBMISSION_AUTO_GRADE_ON_EXTRACT || "true").toLowerCase()
    );
    if (autoGradeEnabled) {
      const eligible = await prisma.submission.findUnique({
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
        },
      });
      const shouldAutoGrade =
        !!eligible?.studentId &&
        !!eligible?.assignmentId &&
        !!eligible?.assignment?.assignmentBriefId &&
        String(eligible?.status || "").toUpperCase() === "EXTRACTED" &&
        Number(eligible?._count?.assessments || 0) === 0;
      if (shouldAutoGrade) {
        const gradeUrl = new URL(`/api/submissions/${submissionId}/grade`, req.url);
        await fetch(gradeUrl.toString(), { method: "POST", cache: "no-store" });
      }
    }
  } catch (e) {
    console.warn("AUTO_GRADE_AFTER_LINK_FAILED", e);
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { student: true, assignment: true, extractionRuns: { orderBy: { startedAt: "desc" }, include: { pages: { orderBy: { pageNumber: "asc" } } } } },
  });

  return NextResponse.json({ submission });
}
