import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import { extractIvAdPreviewFromMarkedPdfBuffer, buildIvAdNarrative, normalizeGrade } from "@/lib/iv-ad/analysis";
import { fillIvAdTemplateDocx } from "@/lib/iv-ad/docxFiller";
import { ivAdToAbsolutePath, writeIvAdBuffer, writeIvAdUpload } from "@/lib/iv-ad/storage";
import { runIvAdAiReview } from "@/lib/iv-ad/aiReview";
import fs from "fs/promises";
import path from "path";

type GenerateFields = {
  studentName: string;
  programmeTitle: string;
  unitCodeTitle: string;
  assignmentTitle: string;
  assessorName: string;
  internalVerifierName: string;
};

function parseTextField(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function parseBoolField(formData: FormData, key: string, fallback = false) {
  const v = parseTextField(formData, key).toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function parseFields(formData: FormData): GenerateFields {
  const rawFields = formData.get("fields");
  let parsed: any = {};
  if (typeof rawFields === "string" && rawFields.trim()) {
    try {
      parsed = JSON.parse(rawFields);
    } catch {
      parsed = {};
    }
  }
  const fromAny = (key: keyof GenerateFields) => {
    const direct = parseTextField(formData, key);
    if (direct) return direct;
    const fromJson = typeof parsed?.[key] === "string" ? String(parsed[key]).trim() : "";
    return fromJson;
  };
  return {
    studentName: fromAny("studentName"),
    programmeTitle: fromAny("programmeTitle"),
    unitCodeTitle: fromAny("unitCodeTitle"),
    assignmentTitle: fromAny("assignmentTitle"),
    assessorName: fromAny("assessorName"),
    internalVerifierName: fromAny("internalVerifierName"),
  };
}

function isPdfFile(file: File) {
  const ext = path.extname(String(file?.name || "")).toLowerCase();
  return ext === ".pdf";
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
  const denied = await ensureAdmin("/api/admin/iv-ad/generate", requestId);
  if (denied) return denied;

  try {
    const formData = await req.formData();
    const fields = parseFields(formData);
    const missing = Object.entries(fields)
      .filter(([, v]) => !String(v || "").trim())
      .map(([k]) => k);
    if (missing.length) {
      return apiError({
        status: 400,
        code: "IV_AD_MISSING_FIELDS",
        userMessage: `Missing required fields: ${missing.join(", ")}`,
        route: "/api/admin/iv-ad/generate",
        requestId,
      });
    }

    const markedPdf = formData.get("markedPdf");
    const briefPdf = formData.get("briefPdf");
    const referenceSpecId = parseTextField(formData, "referenceSpecId");
    const useAiReview = parseBoolField(formData, "useAiReview", true);

    if (!(markedPdf instanceof File)) {
      return apiError({
        status: 400,
        code: "IV_AD_MARKED_PDF_REQUIRED",
        userMessage: "Marked Submission PDF is required.",
        route: "/api/admin/iv-ad/generate",
        requestId,
      });
    }
    if (!isPdfFile(markedPdf)) {
      return apiError({
        status: 400,
        code: "IV_AD_MARKED_PDF_INVALID",
        userMessage: "Marked submission must be a PDF file.",
        route: "/api/admin/iv-ad/generate",
        requestId,
      });
    }
    if (briefPdf instanceof File && !isPdfFile(briefPdf)) {
      return apiError({
        status: 400,
        code: "IV_AD_BRIEF_PDF_INVALID",
        userMessage: "Optional brief/spec file must be a PDF.",
        route: "/api/admin/iv-ad/generate",
        requestId,
      });
    }
    let selectedSpecDoc: { id: string; storagePath: string; type: string } | null = null;
    if (referenceSpecId) {
      selectedSpecDoc = await prisma.referenceDocument.findUnique({
        where: { id: referenceSpecId },
        select: { id: true, storagePath: true, type: true },
      });
      if (!selectedSpecDoc || selectedSpecDoc.type !== "SPEC") {
        return apiError({
          status: 400,
          code: "IV_AD_REFERENCE_SPEC_INVALID",
          userMessage: "Selected spec was not found in the reference library.",
          route: "/api/admin/iv-ad/generate",
          requestId,
          details: { referenceSpecId },
        });
      }
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
        route: "/api/admin/iv-ad/generate",
        requestId,
      });
    }

    const markedBytes = Buffer.from(await markedPdf.arrayBuffer());
    const markedSaved = await writeIvAdBuffer({
      bucket: "inputs",
      originalFilename: markedPdf.name,
      buffer: markedBytes,
      prefix: "marked",
    });
    const briefSaved =
      briefPdf instanceof File
        ? await writeIvAdUpload({ bucket: "inputs", file: briefPdf, prefix: "brief" })
        : null;

    const preview = await extractIvAdPreviewFromMarkedPdfBuffer(markedBytes);
    const gradeOverride = normalizeGrade(parseTextField(formData, "gradeOverride"));
    const finalGrade = gradeOverride || preview.extractedGradeGuess;
    if (!finalGrade) {
      return apiError({
        status: 400,
        code: "IV_AD_GRADE_UNRESOLVED",
        userMessage: "Could not infer grade from the marked PDF. Please set Grade Override.",
        route: "/api/admin/iv-ad/generate",
        requestId,
      });
    }
    const keyNotesOverride = parseTextField(formData, "keyNotesOverride");
    const finalKeyNotes = keyNotesOverride || preview.extractedKeyNotesGuess || "";

    let narrative = buildIvAdNarrative({
      finalGrade,
      keyNotes: finalKeyNotes,
    });
    let aiReview: any = null;
    let aiReviewReason: string | null = null;

    if (useAiReview) {
      let specExtractedText = "";
      if (selectedSpecDoc?.storagePath) {
        try {
          const specAbsPath = ivAdToAbsolutePath(selectedSpecDoc.storagePath);
          const specBytes = await fs.readFile(specAbsPath);
          const specPreview = await extractIvAdPreviewFromMarkedPdfBuffer(specBytes);
          specExtractedText = String(specPreview?.extractedText || "");
        } catch {
          specExtractedText = "";
        }
      }

      const ai = await runIvAdAiReview({
        studentName: fields.studentName,
        programmeTitle: fields.programmeTitle,
        unitCodeTitle: fields.unitCodeTitle,
        assignmentTitle: fields.assignmentTitle,
        assessorName: fields.assessorName,
        internalVerifierName: fields.internalVerifierName,
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
    const assessorSignatureEmail =
      String(appConfig?.activeAuditUser?.email || "").trim() || "rodrigo@unicourse.org";
    const signatureDate = new Date().toLocaleDateString("en-GB");
    const filled = await fillIvAdTemplateDocx(templateBuffer, {
      programmeTitle: fields.programmeTitle,
      unitCodeTitle: fields.unitCodeTitle,
      assessorName: fields.assessorName,
      internalVerifierName: fields.internalVerifierName,
      assignmentTitle: fields.assignmentTitle,
      studentName: fields.studentName,
      grade: finalGrade,
      generalComments: narrative.generalComments,
      actionRequired: narrative.actionRequired,
      internalVerifierSignature: assessorSignatureEmail,
      assessorSignature: assessorSignatureEmail,
      signatureDate,
    });

    const outFilename = `${fields.studentName}-${fields.unitCodeTitle}-${fields.assignmentTitle}-IV-AD.docx`;
    const savedOutput = await writeIvAdBuffer({
      bucket: "outputs",
      originalFilename: outFilename,
      buffer: filled.buffer,
      prefix: "iv-ad",
    });

    const savedRecord = await prisma.ivAdDocument.create({
      data: {
        templateId: activeTemplate.id,
        studentName: fields.studentName,
        programmeTitle: fields.programmeTitle,
        unitCodeTitle: fields.unitCodeTitle,
        assignmentTitle: fields.assignmentTitle,
        assessorName: fields.assessorName,
        internalVerifierName: fields.internalVerifierName,
        grade: finalGrade,
        keyNotes: finalKeyNotes || null,
        sourceMarkedPdfPath: markedSaved.storagePath,
        sourceBriefPdfPath: briefSaved?.storagePath ?? selectedSpecDoc?.storagePath ?? null,
        outputDocxPath: savedOutput.storagePath,
      },
      include: {
        template: {
          select: { id: true, filename: true, createdAt: true },
        },
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
      code: "IV_AD_GENERATE_FAILED",
      userMessage: "Failed to generate IV DOCX.",
      route: "/api/admin/iv-ad/generate",
      requestId,
      cause: err,
    });
  }
}
    const appConfig = await prisma.appConfig.findUnique({
      where: { id: 1 },
      select: { activeAuditUser: { select: { email: true } } },
    });
