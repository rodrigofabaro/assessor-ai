import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import { extractIvAdPreviewFromMarkedPdfBuffer, buildIvAdNarrative, normalizeGrade } from "@/lib/iv-ad/analysis";
import { fillIvAdTemplateDocx } from "@/lib/iv-ad/docxFiller";
import { ivAdToAbsolutePath, writeIvAdBuffer } from "@/lib/iv-ad/storage";
import { runIvAdAiReview } from "@/lib/iv-ad/aiReview";
import fs from "fs/promises";
import path from "path";

function normalizeText(s: unknown) {
  return String(s || "").trim();
}

function resolvePathMaybeRelative(p: string) {
  if (!p) return "";
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function buildUnitCodeTitle(input: {
  assignmentUnitCode?: string | null;
  unitCode?: string | null;
  unitTitle?: string | null;
}) {
  const code = normalizeText(input.unitCode || input.assignmentUnitCode);
  const title = normalizeText(input.unitTitle);
  if (code && title) return `${code} - ${title}`;
  if (code) return code;
  if (title) return title;
  return "Unit";
}

function isPlaceholderAssignmentTitle(value: string) {
  const v = normalizeText(value).toLowerCase();
  if (!v) return true;
  if (v === "assignment") return true;
  if (/^auto[- ]generated[:\s]/i.test(v)) return true;
  return false;
}

async function ensureAdmin(route: string, requestId: string) {
  const guard = await isAdminMutationAllowed();
  if (guard.ok) return null;
  return apiError({
    status: 403,
    code: "ADMIN_REQUIRED",
    userMessage: guard.reason || "Admin access required.",
    route,
    requestId,
  });
}

export async function POST(req: Request) {
  const requestId = makeRequestId();
  const denied = await ensureAdmin("/api/admin/iv-ad/generate-from-submission", requestId);
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      submissionId?: string;
      useAiReview?: boolean;
      internalVerifierName?: string;
    };

    const submissionId = normalizeText(body?.submissionId);
    if (!submissionId) {
      return apiError({
        status: 400,
        code: "IV_AD_SUBMISSION_ID_REQUIRED",
        userMessage: "submissionId is required.",
        route: "/api/admin/iv-ad/generate-from-submission",
        requestId,
      });
    }

    const useAiReview = body?.useAiReview !== false;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        student: { select: { fullName: true, courseName: true } },
        assignment: {
          select: {
            unitCode: true,
            assignmentRef: true,
            title: true,
            assignmentBrief: {
              select: {
                title: true,
                unit: {
                  select: {
                    unitCode: true,
                    unitTitle: true,
                    specDocument: {
                      select: {
                        storagePath: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        assessments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            overallGrade: true,
            feedbackText: true,
            annotatedPdfPath: true,
            resultJson: true,
          },
        },
      },
    });

    if (!submission) {
      return apiError({
        status: 404,
        code: "IV_AD_SUBMISSION_NOT_FOUND",
        userMessage: "Submission not found.",
        route: "/api/admin/iv-ad/generate-from-submission",
        requestId,
      });
    }

    const latestAssessment = submission.assessments?.[0] || null;
    const markedPdfPath = normalizeText(latestAssessment?.annotatedPdfPath);
    if (!markedPdfPath) {
      return apiError({
        status: 422,
        code: "IV_AD_MARKED_PDF_MISSING",
        userMessage: "No marked PDF found for this submission. Generate marking output first.",
        route: "/api/admin/iv-ad/generate-from-submission",
        requestId,
        details: { submissionId },
      });
    }

    const activeTemplate = await prisma.ivAdTemplate.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });
    if (!activeTemplate) {
      return apiError({
        status: 400,
        code: "IV_AD_NO_ACTIVE_TEMPLATE",
        userMessage: "No active IV-AD template found. Upload a DOCX template first.",
        route: "/api/admin/iv-ad/generate-from-submission",
        requestId,
      });
    }

    const existing = await prisma.ivAdDocument.findFirst({
      where: {
        templateId: activeTemplate.id,
        sourceMarkedPdfPath: markedPdfPath,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, assignmentTitle: true },
    });
    if (existing && !isPlaceholderAssignmentTitle(existing.assignmentTitle)) {
      return NextResponse.json(
        {
          reused: true,
          documentId: existing.id,
          downloadUrl: `/api/admin/iv-ad/documents/${existing.id}/file`,
          requestId,
        },
        { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } }
      );
    }

    const appConfig = await prisma.appConfig.findUnique({
      where: { id: 1 },
      select: { activeAuditUser: { select: { fullName: true, email: true } } },
    });

    const markedAbs = resolvePathMaybeRelative(markedPdfPath);
    const markedBytes = await fs.readFile(markedAbs);
    const preview = await extractIvAdPreviewFromMarkedPdfBuffer(markedBytes);
    const finalGrade = normalizeGrade(latestAssessment?.overallGrade) || preview.extractedGradeGuess;
    if (!finalGrade) {
      return apiError({
        status: 422,
        code: "IV_AD_GRADE_UNRESOLVED",
        userMessage: "Could not resolve grade for this submission.",
        route: "/api/admin/iv-ad/generate-from-submission",
        requestId,
        details: { submissionId },
      });
    }

    const studentName = normalizeText(submission.student?.fullName) || "Student";
    const programmeTitle = normalizeText(submission.student?.courseName) || "Programme";
    const unitCodeTitle = buildUnitCodeTitle({
      assignmentUnitCode: submission.assignment?.unitCode,
      unitCode: submission.assignment?.assignmentBrief?.unit?.unitCode,
      unitTitle: submission.assignment?.assignmentBrief?.unit?.unitTitle,
    });
    const assignmentTitleFromAssignment = normalizeText(submission.assignment?.title);
    const assignmentTitleFromBrief = normalizeText(submission.assignment?.assignmentBrief?.title);
    const assignmentTitle =
      (!isPlaceholderAssignmentTitle(assignmentTitleFromAssignment) ? assignmentTitleFromAssignment : "") ||
      assignmentTitleFromBrief ||
      normalizeText(submission.assignment?.assignmentRef) ||
      "Assignment";

    const gradedBy = normalizeText((latestAssessment?.resultJson as any)?.gradedBy);
    const assessorName = gradedBy || "Assessor";
    const internalVerifierName =
      normalizeText(body?.internalVerifierName) ||
      normalizeText(appConfig?.activeAuditUser?.fullName) ||
      "Internal Verifier";
    const assessorSignatureEmail =
      normalizeText(appConfig?.activeAuditUser?.email) ||
      "rodrigo@unicourse.org";
    const signatureDate = new Date().toLocaleDateString("en-GB");

    const feedbackSnippet = normalizeText(latestAssessment?.feedbackText);
    const finalKeyNotes = preview.extractedKeyNotesGuess || feedbackSnippet.slice(0, 600);

    let narrative = buildIvAdNarrative({
      finalGrade,
      keyNotes: finalKeyNotes,
    });
    let aiReview: any = null;
    let aiReviewReason: string | null = null;

    if (useAiReview) {
      let specExtractedText = "";
      const specStoragePath = normalizeText(submission.assignment?.assignmentBrief?.unit?.specDocument?.storagePath);
      if (specStoragePath) {
        try {
          const specAbsPath = ivAdToAbsolutePath(specStoragePath);
          const specBytes = await fs.readFile(specAbsPath);
          const specPreview = await extractIvAdPreviewFromMarkedPdfBuffer(specBytes);
          specExtractedText = String(specPreview?.extractedText || "");
        } catch {
          specExtractedText = "";
        }
      }

      const ai = await runIvAdAiReview({
        studentName,
        programmeTitle,
        unitCodeTitle,
        assignmentTitle,
        assessorName,
        internalVerifierName,
        finalGrade,
        keyNotes: finalKeyNotes,
        markedExtractedText: String(preview.extractedText || ""),
        specExtractedText,
      });

      if (!ai.ok) {
        aiReviewReason = "reason" in ai ? String(ai.reason || "AI_REVIEW_FAILED") : "AI_REVIEW_FAILED";
      } else {
        aiReview = ai.review;
        narrative = {
          generalComments: ai.review.generalComments,
          actionRequired: ai.review.actionRequired,
        };
      }
    }

    const templateAbs = ivAdToAbsolutePath(activeTemplate.storagePath);
    const templateBuffer = await fs.readFile(templateAbs);
    const filled = await fillIvAdTemplateDocx(templateBuffer, {
      programmeTitle,
      unitCodeTitle,
      assessorName,
      internalVerifierName,
      assignmentTitle,
      studentName,
      grade: finalGrade,
      generalComments: narrative.generalComments,
      actionRequired: narrative.actionRequired,
      internalVerifierSignature: assessorSignatureEmail,
      assessorSignature: assessorSignatureEmail,
      signatureDate,
    });

    const outFilename = `${studentName}-${unitCodeTitle}-${assignmentTitle}-IV-AD.docx`;
    const savedOutput = await writeIvAdBuffer({
      bucket: "outputs",
      originalFilename: outFilename,
      buffer: filled.buffer,
      prefix: "iv-ad",
    });

    const savedRecord = await prisma.ivAdDocument.create({
      data: {
        templateId: activeTemplate.id,
        studentName,
        programmeTitle,
        unitCodeTitle,
        assignmentTitle,
        assessorName,
        internalVerifierName,
        grade: finalGrade,
        keyNotes: finalKeyNotes || null,
        sourceMarkedPdfPath: markedPdfPath,
        sourceBriefPdfPath: normalizeText(submission.assignment?.assignmentBrief?.unit?.specDocument?.storagePath) || null,
        outputDocxPath: savedOutput.storagePath,
      },
      include: {
        template: { select: { id: true, filename: true, createdAt: true } },
      },
    });

    return NextResponse.json(
      {
        document: savedRecord,
        downloadUrl: `/api/admin/iv-ad/documents/${savedRecord.id}/file`,
        extractionPreview: {
          extractedGradeGuess: preview.extractedGradeGuess,
          extractedKeyNotesGuess: preview.extractedKeyNotesGuess,
          pageCount: preview.pageCount,
        },
        aiReview,
        aiReviewReason,
        usedNarrativeSource: aiReview ? "AI" : "HEURISTIC",
        tableShape: filled.tableShape,
        requestId,
      },
      { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return apiError({
      status: 500,
      code: "IV_AD_GENERATE_FROM_SUBMISSION_FAILED",
      userMessage: "Failed to generate IV DOCX from submission.",
      route: "/api/admin/iv-ad/generate-from-submission",
      requestId,
      cause: err,
    });
  }
}
