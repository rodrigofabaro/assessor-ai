import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMarkedPdf } from "@/lib/grading/markedPdf";
import { deriveBulletsFromFeedbackText } from "@/lib/grading/feedbackDocument";
import { readGradingConfig } from "@/lib/grading/config";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";
import { buildPageNotesFromCriterionChecks, extractCriterionChecksFromResultJson } from "@/lib/grading/pageNotes";
import { sanitizeStudentFeedbackText } from "@/lib/grading/studentFeedback";

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
      markedDate?: string;
    };

    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, submissionId },
      include: { submission: { select: { id: true, storagePath: true } } },
    });
    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found for this submission." }, { status: 404 });
    }

    const feedbackText = sanitizeStudentFeedbackText(body.feedbackText);
    if (!feedbackText) {
      return NextResponse.json({ error: "feedbackText is required." }, { status: 400 });
    }

    const gradingCfg = readGradingConfig().config;
    const resultJson = (assessment.resultJson && typeof assessment.resultJson === "object" ? assessment.resultJson : {}) as Record<string, any>;
    const tone = String(resultJson.tone || gradingCfg.tone || "professional");
    const strictness = String(resultJson.strictness || gradingCfg.strictness || "balanced");
    const actor = await getCurrentAuditActor();
    const markedDate = toUkDate(body.markedDate || null);
    const studentName = String(body.studentName || resultJson.studentFirstNameUsed || "Student");
    const feedbackBullets = deriveBulletsFromFeedbackText(feedbackText, gradingCfg.maxFeedbackBullets);
    const criterionChecks = extractCriterionChecksFromResultJson(resultJson);
    const pageNotes = gradingCfg.pageNotesEnabled
      ? buildPageNotesFromCriterionChecks(criterionChecks, {
          maxPages: gradingCfg.pageNotesMaxPages,
          maxLinesPerPage: gradingCfg.pageNotesMaxLinesPerPage,
          tone: gradingCfg.pageNotesTone,
          includeCriterionCode: gradingCfg.studentSafeMarkedPdf ? false : gradingCfg.pageNotesIncludeCriterionCode,
        })
      : [];

    const marked = await createMarkedPdf(assessment.submission.storagePath, {
      submissionId: assessment.submission.id,
      overallGrade: String(assessment.overallGrade || "REFER"),
      feedbackBullets: feedbackBullets.length ? feedbackBullets : ["Feedback generated."],
      feedbackText,
      studentSafe: gradingCfg.studentSafeMarkedPdf,
      tone,
      strictness,
      studentName,
      assessorName: actor,
      markedDate,
      overallPlacement: "last",
      pageNotes,
    });

    const updated = await prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        feedbackText,
        annotatedPdfPath: marked.storagePath,
        resultJson: {
          ...resultJson,
          gradedBy: actor,
          pageNotesGenerated: pageNotes,
          pageNotesConfigUsed: {
            enabled: gradingCfg.pageNotesEnabled,
            tone: gradingCfg.pageNotesTone,
            maxPages: gradingCfg.pageNotesMaxPages,
            maxLinesPerPage: gradingCfg.pageNotesMaxLinesPerPage,
            includeCriterionCode: gradingCfg.studentSafeMarkedPdf ? false : gradingCfg.pageNotesIncludeCriterionCode,
          },
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
