import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMarkedPdf } from "@/lib/grading/markedPdf";
import { deriveBulletsFromFeedbackText } from "@/lib/grading/feedbackDocument";
import { readGradingConfig } from "@/lib/grading/config";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";

export const runtime = "nodejs";

function toUkDate(value?: string | null) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("en-GB");
  return d.toLocaleDateString("en-GB");
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ submissionId: string; assessmentId: string }> }
) {
  try {
    const { submissionId, assessmentId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      feedbackText?: string;
      studentName?: string;
      assessorName?: string;
      markedDate?: string;
    };

    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, submissionId },
      include: { submission: { select: { id: true, storagePath: true } } },
    });
    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found for this submission." }, { status: 404 });
    }

    const feedbackText = String(body.feedbackText || "").trim();
    if (!feedbackText) {
      return NextResponse.json({ error: "feedbackText is required." }, { status: 400 });
    }

    const gradingCfg = readGradingConfig().config;
    const resultJson = (assessment.resultJson && typeof assessment.resultJson === "object" ? assessment.resultJson : {}) as Record<string, any>;
    const tone = String(resultJson.tone || gradingCfg.tone || "professional");
    const strictness = String(resultJson.strictness || gradingCfg.strictness || "balanced");
    const actor = await getCurrentAuditActor(String(body.assessorName || resultJson.gradedBy || ""));
    const markedDate = toUkDate(body.markedDate || null);
    const studentName = String(body.studentName || resultJson.studentFirstNameUsed || "Student");
    const feedbackBullets = deriveBulletsFromFeedbackText(feedbackText, gradingCfg.maxFeedbackBullets);

    const marked = await createMarkedPdf(assessment.submission.storagePath, {
      submissionId: assessment.submission.id,
      overallGrade: String(assessment.overallGrade || "REFER"),
      feedbackBullets: feedbackBullets.length ? feedbackBullets : ["Feedback generated."],
      tone,
      strictness,
      studentName,
      assessorName: actor,
      markedDate,
    });

    const updated = await prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        feedbackText,
        annotatedPdfPath: marked.storagePath,
        resultJson: {
          ...resultJson,
          gradedBy: actor,
          feedbackOverride: {
            edited: true,
            editedAt: new Date().toISOString(),
            studentName,
            assessorName: actor,
            markedDate,
            bulletCount: feedbackBullets.length,
          },
        } as any,
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        overallGrade: true,
        feedbackText: true,
        annotatedPdfPath: true,
        resultJson: true,
      },
    });

    return NextResponse.json({ ok: true, assessment: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update assessment feedback." }, { status: 500 });
  }
}
