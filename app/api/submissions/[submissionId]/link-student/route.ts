import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";
import { triggerAutoGradeIfAutoReady } from "@/lib/submissions/autoGrade";

export async function POST(req: Request, ctx: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const studentId = String(body?.studentId || "");
  const actor = await getCurrentAuditActor(body?.actor);
  const organizationId = await getRequestOrganizationId();

  if (!studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  const sub = await prisma.submission.findFirst({
    where: addOrganizationReadScope({ id: submissionId }, organizationId) as any,
    select: { id: true, studentId: true, organizationId: true },
  });
  if (!sub) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  const student = await prisma.student.findFirst({
    where: addOrganizationReadScope({ id: studentId }, String(sub.organizationId || organizationId || "").trim() || null) as any,
    select: { id: true },
  });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

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

  // Best-effort auto-grade when linking moves submission into AUTO_READY.
  try {
    await triggerAutoGradeIfAutoReady(submissionId, req.url);
  } catch (e) {
    console.warn("AUTO_GRADE_AFTER_LINK_FAILED", e);
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { student: true, assignment: true, extractionRuns: { orderBy: { startedAt: "desc" }, include: { pages: { orderBy: { pageNumber: "asc" } } } } },
  });

  return NextResponse.json({ submission });
}
