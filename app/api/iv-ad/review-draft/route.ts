import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import { appendOpsEvent } from "@/lib/ops/eventLog";
import { parseIvAdReviewDraftRequest, runIvAdReviewDraft, type IvAdReviewDraftRequest } from "@/lib/iv-ad/reviewDraft";
import { extractIvAdPreviewFromMarkedPdfBuffer, normalizeGrade } from "@/lib/iv-ad/analysis";
import { resolveStorageAbsolutePathAsync } from "@/lib/storage/provider";
import fs from "fs/promises";
import path from "path";

const ROUTE = "/api/iv-ad/review-draft";

async function ensureAdmin(requestId: string) {
  const guard = await isAdminMutationAllowed();
  if (guard.ok) return null;
  return apiError({
    status: 403,
    code: "ADMIN_REQUIRED",
    userMessage: guard.reason || "Admin access required.",
    route: ROUTE,
    requestId,
  });
}

function mapDraftErrorToResponse(reason: string, requestId: string) {
  if (reason === "OPENAI_API_KEY_MISSING") {
    return apiError({
      status: 503,
      code: "IV_AD_REVIEW_DRAFT_PROVIDER_UNAVAILABLE",
      userMessage: "AI review provider is not configured (missing API key).",
      route: ROUTE,
      requestId,
    });
  }
  if (reason === "MODEL_UNRESOLVED") {
    return apiError({
      status: 500,
      code: "IV_AD_REVIEW_DRAFT_MODEL_UNRESOLVED",
      userMessage: "IV-AD review model could not be resolved.",
      route: ROUTE,
      requestId,
    });
  }
  if (reason === "MODEL_OUTPUT_INVALID") {
    return apiError({
      status: 422,
      code: "IV_AD_REVIEW_DRAFT_MODEL_OUTPUT_INVALID",
      userMessage: "AI review output did not match the required draft schema. Retry review.",
      route: ROUTE,
      requestId,
    });
  }
  if (reason.startsWith("OPENAI_FAILED:")) {
    return apiError({
      status: 502,
      code: "IV_AD_REVIEW_DRAFT_PROVIDER_FAILED",
      userMessage: "AI review provider request failed. Retry review.",
      route: ROUTE,
      requestId,
      details: {
        providerReason: reason.slice("OPENAI_FAILED:".length),
      },
    });
  }
  return apiError({
    status: 500,
    code: "IV_AD_REVIEW_DRAFT_FAILED",
    userMessage: "Failed to build IV-AD review draft.",
    route: ROUTE,
    requestId,
    details: { reason },
  });
}

function parseTextField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isPdfFile(file: File) {
  const ext = path.extname(String(file?.name || "")).toLowerCase();
  return ext === ".pdf";
}

function mapValidationIssues(
  requestId: string,
  issues: Array<{ path: readonly PropertyKey[]; code: string; message: string }>
) {
  return {
    requestId,
    issueCount: issues.length,
    issues: issues.slice(0, 8).map((issue) => ({
      path: issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number").join("."),
      code: issue.code,
      message: issue.message,
    })),
  };
}

function invalidRequestResponse(
  requestId: string,
  issues: Array<{ path: readonly PropertyKey[]; code: string; message: string }>
) {
  const details = mapValidationIssues(requestId, issues);
  appendOpsEvent({
    type: "iv_ad_review_draft_invalid_request",
    route: ROUTE,
    status: 400,
    details,
  });
  return apiError({
    status: 400,
    code: "IV_AD_REVIEW_DRAFT_INVALID_REQUEST",
    userMessage: "Invalid review draft request payload.",
    route: ROUTE,
    requestId,
    details: { issues: details.issues },
  });
}

async function resolveInput(req: Request, requestId: string): Promise<{ input: IvAdReviewDraftRequest } | { error: NextResponse }> {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const markedPdf = formData.get("markedPdf");
    if (!(markedPdf instanceof File)) {
      return {
        error: apiError({
          status: 400,
          code: "IV_AD_MARKED_PDF_REQUIRED",
          userMessage: "Marked Submission PDF is required.",
          route: ROUTE,
          requestId,
        }),
      };
    }
    if (!isPdfFile(markedPdf)) {
      return {
        error: apiError({
          status: 400,
          code: "IV_AD_MARKED_PDF_INVALID",
          userMessage: "Marked submission must be a PDF file.",
          route: ROUTE,
          requestId,
        }),
      };
    }

    const markedBytes = Buffer.from(await markedPdf.arrayBuffer());
    const markedPreview = await extractIvAdPreviewFromMarkedPdfBuffer(markedBytes);

    const referenceSpecId = parseTextField(formData, "referenceSpecId");
    const specPdf = formData.get("specPdf");
    let specExtractedText = "";
    if (specPdf instanceof File) {
      if (!isPdfFile(specPdf)) {
        return {
          error: apiError({
            status: 400,
            code: "IV_AD_SPEC_PDF_INVALID",
            userMessage: "Optional spec file must be a PDF.",
            route: ROUTE,
            requestId,
          }),
        };
      }
      const specBytes = Buffer.from(await specPdf.arrayBuffer());
      const specPreview = await extractIvAdPreviewFromMarkedPdfBuffer(specBytes);
      specExtractedText = String(specPreview.extractedText || "");
    } else if (referenceSpecId) {
      const refSpec = await prisma.referenceDocument.findUnique({
        where: { id: referenceSpecId },
        select: { id: true, type: true, storagePath: true },
      });
      if (!refSpec || refSpec.type !== "SPEC") {
        return {
          error: apiError({
            status: 400,
            code: "IV_AD_REFERENCE_SPEC_INVALID",
            userMessage: "Selected spec was not found in the reference library.",
            route: ROUTE,
            requestId,
            details: { referenceSpecId },
          }),
        };
      }
      try {
        const specAbsPath = await resolveStorageAbsolutePathAsync(refSpec.storagePath);
        if (!specAbsPath) throw new Error("SPEC_PATH_UNRESOLVED");
        const specBytes = await fs.readFile(specAbsPath);
        const specPreview = await extractIvAdPreviewFromMarkedPdfBuffer(specBytes);
        specExtractedText = String(specPreview.extractedText || "");
      } catch {
        specExtractedText = "";
      }
    }

    const finalGrade =
      parseTextField(formData, "finalGrade") ||
      normalizeGrade(parseTextField(formData, "gradeOverride")) ||
      markedPreview.extractedGradeGuess ||
      "";

    const inputCandidate = {
      studentName: parseTextField(formData, "studentName"),
      programmeTitle: parseTextField(formData, "programmeTitle"),
      unitCodeTitle: parseTextField(formData, "unitCodeTitle"),
      assignmentTitle: parseTextField(formData, "assignmentTitle"),
      assessorName: parseTextField(formData, "assessorName"),
      internalVerifierName: parseTextField(formData, "internalVerifierName"),
      finalGrade,
      keyNotes: parseTextField(formData, "keyNotes") || parseTextField(formData, "keyNotesOverride"),
      markedExtractedText: String(markedPreview.extractedText || ""),
      assessmentFeedbackText: parseTextField(formData, "assessmentFeedbackText"),
      specExtractedText,
    };

    const parsed = parseIvAdReviewDraftRequest(inputCandidate);
    if (!parsed.success) {
      return {
        error: invalidRequestResponse(requestId, parsed.error.issues),
      };
    }
    return { input: parsed.data };
  }

  const body = await req.json().catch(() => null);
  const parsed = parseIvAdReviewDraftRequest(body);
  if (!parsed.success) {
    return {
      error: invalidRequestResponse(requestId, parsed.error.issues),
    };
  }
  return { input: parsed.data };
}

export async function POST(req: Request) {
  const requestId = makeRequestId();
  const denied = await ensureAdmin(requestId);
  if (denied) return denied;

  try {
    const resolved = await resolveInput(req, requestId);
    if ("error" in resolved) return resolved.error;

    const result = await runIvAdReviewDraft(resolved.input);
    if (!result.ok) {
      const reason = "reason" in result ? result.reason : "IV_AD_REVIEW_DRAFT_FAILED";
      appendOpsEvent({
        type: "iv_ad_review_draft_failed",
        route: ROUTE,
        status: 500,
        details: { requestId, reason },
      });
      return mapDraftErrorToResponse(reason, requestId);
    }

    appendOpsEvent({
      type: "iv_ad_review_draft_generated",
      route: ROUTE,
      status: 200,
      details: {
        requestId,
        model: result.draft.model,
        confidence: result.draft.confidence,
        warningCount: result.draft.warnings.length,
        evidenceSnippetCount: result.draft.evidenceSnippets.length,
      },
    });

    return NextResponse.json(
      {
        draft: result.draft,
        requestId,
      },
      { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } }
    );
  } catch (err) {
    appendOpsEvent({
      type: "iv_ad_review_draft_crash",
      route: ROUTE,
      status: 500,
      details: { requestId },
    });
    return apiError({
      status: 500,
      code: "IV_AD_REVIEW_DRAFT_UNEXPECTED",
      userMessage: "Unexpected failure while generating review draft.",
      route: ROUTE,
      requestId,
      cause: err,
    });
  }
}
