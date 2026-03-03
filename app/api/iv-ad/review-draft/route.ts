import { NextResponse } from "next/server";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import { appendOpsEvent } from "@/lib/ops/eventLog";
import { parseIvAdReviewDraftRequest, runIvAdReviewDraft } from "@/lib/iv-ad/reviewDraft";

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

export async function POST(req: Request) {
  const requestId = makeRequestId();
  const denied = await ensureAdmin(requestId);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => null);
    const parsedInput = parseIvAdReviewDraftRequest(body);
    if (!parsedInput.success) {
      appendOpsEvent({
        type: "iv_ad_review_draft_invalid_request",
        route: ROUTE,
        status: 400,
        details: {
          requestId,
          issueCount: parsedInput.error.issues.length,
          issues: parsedInput.error.issues.slice(0, 8).map((issue) => ({
            path: issue.path.join("."),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
      return apiError({
        status: 400,
        code: "IV_AD_REVIEW_DRAFT_INVALID_REQUEST",
        userMessage: "Invalid review draft request payload.",
        route: ROUTE,
        requestId,
        details: {
          issues: parsedInput.error.issues.slice(0, 8).map((issue) => ({
            path: issue.path.join("."),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
    }

    const result = await runIvAdReviewDraft(parsedInput.data);
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
