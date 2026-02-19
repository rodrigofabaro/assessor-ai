import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCoverMetadataReady } from "@/lib/submissions/coverMetadata";
import { sanitizeStudentFeedbackText } from "@/lib/grading/studentFeedback";
import { triggerAutoGradeIfAutoReady } from "@/lib/submissions/autoGrade";

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
          feedbackText: true,
          annotatedPdfPath: true,
          resultJson: true,
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

  return NextResponse.json({
    submission: {
      ...submission,
      assessments: (submission.assessments || []).map((a) => ({
        ...a,
        feedbackText: sanitizeStudentFeedbackText(a.feedbackText || null) || null,
      })),
    },
  });
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

    const coverMetadata = body?.coverMetadata;
    if (coverMetadata && typeof coverMetadata === "object") {
      const latestRun = await prisma.submissionExtractionRun.findFirst({
        where: { submissionId },
        orderBy: { startedAt: "desc" },
        select: { id: true, sourceMeta: true },
      });
      if (!latestRun) {
        return NextResponse.json({ error: "No extraction run found for this submission." }, { status: 404 });
      }
      const prevMeta = (latestRun.sourceMeta && typeof latestRun.sourceMeta === "object" ? latestRun.sourceMeta : {}) as Record<
        string,
        unknown
      >;
      const nextCover = coverMetadata as Record<string, unknown>;
      const nextSourceMeta = {
        ...prevMeta,
        coverMetadata: nextCover,
        coverReady: isCoverMetadataReady(nextCover),
      };

      const updatedRun = await prisma.submissionExtractionRun.update({
        where: { id: latestRun.id },
        data: { sourceMeta: nextSourceMeta as any },
        select: { id: true, sourceMeta: true },
      });

      // Best-effort triage refresh so cover edits can improve linking signals.
      try {
        const triageUrl = new URL(`/api/submissions/${submissionId}/triage`, req.url);
        await fetch(triageUrl.toString(), { method: "POST", cache: "no-store" });
      } catch (e) {
        console.warn("COVER_METADATA_TRIAGE_REFRESH_FAILED", e);
      }

      // Best-effort re-grade so feedback can pick updated student first name.
      try {
        const autoRegradeEnabled = ["1", "true", "yes", "on"].includes(
          String(process.env.SUBMISSION_AUTO_REGRADE_ON_COVER_UPDATE || "true").toLowerCase()
        );
        if (autoRegradeEnabled) {
          const s = await prisma.submission.findUnique({
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
            },
          });
          const canRegrade =
            !!s?.studentId &&
            !!s?.assignmentId &&
            !!s?.assignment?.assignmentBriefId &&
            ["EXTRACTED", "DONE"].includes(String(s?.status || "").toUpperCase());
          if (canRegrade) {
            const gradeUrl = new URL(`/api/submissions/${submissionId}/grade`, req.url);
            await fetch(gradeUrl.toString(), { method: "POST", cache: "no-store" });
          }
        }
      } catch (e) {
        console.warn("COVER_METADATA_AUTO_REGRADE_FAILED", e);
      }

      return NextResponse.json({ ok: true, extractionRun: updatedRun });
    }

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

    try {
      await triggerAutoGradeIfAutoReady(submissionId, req.url);
    } catch (e) {
      console.warn("AUTO_GRADE_AFTER_MANUAL_LINK_FAILED", e);
    }

    return NextResponse.json({ ok: true, submission: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Update failed" }, { status: 500 });
  }
}
