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

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { student: true, assignment: true, extractionRuns: { orderBy: { startedAt: "desc" }, include: { pages: { orderBy: { pageNumber: "asc" } } } } },
  });

  return NextResponse.json({ submission });
}
