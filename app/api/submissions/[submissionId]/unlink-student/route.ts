import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";

export async function POST(req: Request, ctx: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const actor = await getCurrentAuditActor(body?.actor);

  const sub = await prisma.submission.findUnique({ where: { id: submissionId }, select: { studentId: true } });
  if (!sub) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      studentId: null,
      studentLinkedAt: null,
      studentLinkedBy: null,
    },
  });

  await prisma.submissionAuditEvent.create({
    data: {
      submissionId,
      type: "STUDENT_UNLINKED",
      actor,
      meta: { previousStudentId: sub.studentId },
    },
  });

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { student: true, assignment: true, extractionRuns: { orderBy: { startedAt: "desc" }, include: { pages: { orderBy: { pageNumber: "asc" } } } } },
  });

  return NextResponse.json({ submission });
}
