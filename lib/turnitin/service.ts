import { prisma } from "@/lib/prisma";
import {
  acceptTurnitinEula,
  createTurnitinSubmission,
  createTurnitinViewerUrl,
  getTurnitinSimilarity,
  TurnitinApiError,
  uploadTurnitinOriginal,
  requestTurnitinSimilarity,
} from "@/lib/turnitin/client";
import {
  resolveTurnitinRuntimeConfig,
  type ResolvedTurnitinConfig,
} from "@/lib/turnitin/config";
import {
  getTurnitinSubmissionState,
  type TurnitinSubmissionState,
  upsertTurnitinSubmissionState,
} from "@/lib/turnitin/state";

export class TurnitinServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TurnitinServiceError";
    this.status = status;
  }
}

function currentStageLabel() {
  const stage =
    String(process.env.APP_STAGE || "").trim() ||
    String(process.env.VERCEL_ENV || "").trim() ||
    String(process.env.NODE_ENV || "").trim() ||
    "unknown";
  return stage.toLowerCase();
}

function isQaLikeStage() {
  const stage = currentStageLabel();
  return ["qa", "test", "development", "dev"].includes(stage);
}

function ensureTurnitinAvailable(cfg: ResolvedTurnitinConfig) {
  if (!cfg.enabled) throw new TurnitinServiceError("Turnitin integration is disabled in settings.", 409);
  if (!cfg.apiKey) throw new TurnitinServiceError("Turnitin API key is missing.", 400);
  if (cfg.qaOnly && !isQaLikeStage()) {
    throw new TurnitinServiceError(
      `Turnitin is restricted to QA-like stages. Current stage: '${currentStageLabel()}'.`,
      403
    );
  }
}

function normalizedStatus(raw: unknown) {
  const up = String(raw || "").trim().toUpperCase();
  if (up === "COMPLETE") return "COMPLETE" as const;
  if (up === "PROCESSING" || up === "CREATED") return "PROCESSING" as const;
  if (up) return "FAILED" as const;
  return "PROCESSING" as const;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof TurnitinApiError) {
    const core = error.message || "Turnitin API error";
    const statusPart = error.status ? `status ${error.status}` : "";
    const codePart = error.code ? `code ${error.code}` : "";
    const refPart = error.reference ? `ref ${error.reference}` : "";
    return [core, statusPart, codePart, refPart].filter(Boolean).join(" · ");
  }
  if (error instanceof TurnitinServiceError) return error.message;
  return String((error as Error)?.message || error || "Unknown Turnitin error");
}

function isInvalidSimilarityMetadataError(error: unknown) {
  if (!(error instanceof TurnitinApiError)) return false;
  if (Number(error.status || 0) !== 422) return false;
  const text = `${error.message || ""} ${error.debugMessage || ""}`.toLowerCase();
  return text.includes("does not contain required information");
}

function hasInvalidSimilarityMetadataMessage(message: unknown) {
  const text = String(message || "").trim().toLowerCase();
  if (!text) return false;
  return text.includes("does not contain required information");
}

function shouldCreateFreshTurnitinSubmission(existing: TurnitinSubmissionState | null) {
  if (!existing?.turnitinSubmissionId) return true;
  const status = String(existing.status || "").trim().toUpperCase();
  if (status !== "FAILED") return false;
  return hasInvalidSimilarityMetadataMessage(existing.lastError);
}

function isRetryableSimilarityBindingError(error: unknown) {
  if (!(error instanceof TurnitinApiError)) return false;
  if (Number(error.status || 0) !== 400) return false;
  const payloadText =
    typeof error.payload === "string" ? error.payload : JSON.stringify(error.payload || "");
  const text = `${error.message || ""} ${error.debugMessage || ""} ${payloadText}`.toLowerCase();
  return (
    text.includes("fatal binding exception") ||
    text.includes("generation_settings") ||
    text.includes("search_repositories")
  );
}

function isSimilarityDeferredConflict(error: unknown) {
  if (!(error instanceof TurnitinApiError)) return false;
  if (Number(error.status || 0) !== 409) return false;
  const payloadText =
    typeof error.payload === "string" ? error.payload : JSON.stringify(error.payload || "");
  const text = `${error.message || ""} ${error.debugMessage || ""} ${payloadText}`.toLowerCase();
  return text.includes("submission has not been completed yet");
}

async function requestSimilarityWithFallback(
  cfg: ResolvedTurnitinConfig,
  turnitinSubmissionId: string
) {
  const attempts: Array<string[] | null> = [
    ["INTERNET", "PUBLICATION", "CROSSREF", "CROSSREF_POSTED_CONTENT", "SUBMITTED_WORK"],
    ["INTERNET", "PUBLICATION", "SUBMITTED_WORK"],
    ["INTERNET", "PUBLICATION"],
    null,
  ];

  let lastError: unknown = null;
  for (const repositories of attempts) {
    try {
      await requestTurnitinSimilarity({
        cfg,
        turnitinSubmissionId,
        searchRepositories: repositories,
      });
      return { requested: true as const, deferred: false as const };
    } catch (error) {
      if (isSimilarityDeferredConflict(error)) {
        return { requested: false as const, deferred: true as const };
      }
      lastError = error;
      if (!isRetryableSimilarityBindingError(error)) {
        throw error;
      }
    }
  }
  throw lastError || new Error("Turnitin similarity request failed.");
}

async function loadSubmissionForTurnitin(submissionId: string) {
  const row = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      filename: true,
      storagePath: true,
      uploadedAt: true,
    },
  });
  if (!row) throw new TurnitinServiceError("Submission not found.", 404);
  return row;
}

function chooseOwner(cfg: ResolvedTurnitinConfig) {
  return String(cfg.ownerUserId || cfg.viewerUserId || "").trim();
}

function chooseViewer(cfg: ResolvedTurnitinConfig) {
  return String(cfg.viewerUserId || cfg.ownerUserId || "").trim();
}

async function maybeEnsureOwnerEula(cfg: ResolvedTurnitinConfig, ownerUserId: string) {
  try {
    await acceptTurnitinEula({
      cfg,
      userId: ownerUserId,
      locale: cfg.locale,
    });
  } catch (error) {
    throw new TurnitinServiceError(
      `Failed to accept Turnitin EULA for owner '${ownerUserId}': ${toErrorMessage(error)}`,
      400
    );
  }
}

function sanitizeScore(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function sanitizeAiPercent(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const normalized = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function normalizeSimilarityTimestamp(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^0{4}-0?1-0?1t00:00:00/i.test(text)) return null;
  if (/^0001-01-01t00:00:00/i.test(text)) return null;
  return text;
}

function findAiPercentCandidate(payload: unknown, depth = 0): number | null {
  if (depth > 4 || payload === null || payload === undefined) return null;
  if (typeof payload === "number") return sanitizeAiPercent(payload);
  if (typeof payload !== "object") return null;

  const rec = payload as Record<string, unknown>;
  const directCandidates = [
    rec.ai_writing_percentage,
    rec.ai_generated_percentage,
    rec.ai_score,
    rec.aiw_score,
    (rec.ai_writing as Record<string, unknown> | undefined)?.percentage,
    (rec.ai_writing as Record<string, unknown> | undefined)?.score,
    (rec.ai_report as Record<string, unknown> | undefined)?.percentage,
    (rec.ai_report as Record<string, unknown> | undefined)?.score,
  ];
  for (const candidate of directCandidates) {
    const parsed = sanitizeAiPercent(candidate);
    if (parsed !== null) return parsed;
  }

  for (const [key, value] of Object.entries(rec)) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    const keyLooksAi = normalizedKey.includes("ai");
    const keyLooksScore =
      normalizedKey.includes("percent") ||
      normalizedKey.includes("percentage") ||
      normalizedKey.includes("score") ||
      normalizedKey.includes("prob");
    if (keyLooksAi && keyLooksScore) {
      const parsed = sanitizeAiPercent(value);
      if (parsed !== null) return parsed;
    }
    if (value && typeof value === "object") {
      const nested = findAiPercentCandidate(value, depth + 1);
      if (nested !== null) return nested;
    }
  }

  return null;
}

function withStateUpdate(
  submissionId: string,
  patch: Partial<TurnitinSubmissionState>
) {
  return upsertTurnitinSubmissionState(submissionId, patch);
}

export function readTurnitinCapability() {
  const cfg = resolveTurnitinRuntimeConfig();
  return {
    enabled: cfg.enabled,
    qaOnly: cfg.qaOnly,
    autoSendOnExtract: cfg.autoSendOnExtract,
    autoDetectAiWritingOnGrade: cfg.autoDetectAiWritingOnGrade,
    configured: Boolean(cfg.apiKey),
    apiKeySource: cfg.apiKeySource,
    baseUrl: cfg.baseUrl,
    stage: currentStageLabel(),
    allowedInCurrentStage: !cfg.qaOnly || isQaLikeStage(),
  };
}

export async function sendSubmissionToTurnitin(submissionId: string) {
  const cfg = resolveTurnitinRuntimeConfig();
  ensureTurnitinAvailable(cfg);
  const ownerUserId = chooseOwner(cfg);
  if (!ownerUserId) {
    throw new TurnitinServiceError("Turnitin owner user id is required in settings.", 400);
  }

  const submission = await loadSubmissionForTurnitin(submissionId);
  try {
    await maybeEnsureOwnerEula(cfg, ownerUserId);
  } catch (error) {
    throw new TurnitinServiceError(`EULA accept failed: ${toErrorMessage(error)}`, 400);
  }

  let turnitinSubmissionId = "";
  try {
    const created = await createTurnitinSubmission({
      cfg,
      owner: ownerUserId,
      title: submission.filename,
    });
    turnitinSubmissionId = String(created?.id || "").trim();
    if (!turnitinSubmissionId) {
      throw new TurnitinServiceError("Turnitin did not return a submission id.", 502);
    }

    withStateUpdate(submissionId, {
      status: "CREATED",
      turnitinSubmissionId,
      aiWritingPercentage: null,
      overallMatchPercentage: null,
      internetMatchPercentage: null,
      publicationMatchPercentage: null,
      submittedWorksMatchPercentage: null,
      reportRequestedAt: null,
      reportGeneratedAt: null,
      viewerUrl: null,
      lastError: null,
    });

    try {
      await uploadTurnitinOriginal({
        cfg,
        turnitinSubmissionId,
        storagePath: submission.storagePath,
        filename: submission.filename,
      });
    } catch (error) {
      throw new TurnitinServiceError(`Original upload failed: ${toErrorMessage(error)}`, 400);
    }
    withStateUpdate(submissionId, {
      status: "UPLOADING",
      turnitinSubmissionId,
      lastError: null,
    });

    let similarityRequested: { requested: boolean; deferred: boolean };
    try {
      similarityRequested = await requestSimilarityWithFallback(cfg, turnitinSubmissionId);
    } catch (error) {
      throw new TurnitinServiceError(`Similarity request failed: ${toErrorMessage(error)}`, 400);
    }
    return withStateUpdate(submissionId, {
      status: "PROCESSING",
      turnitinSubmissionId,
      reportRequestedAt: similarityRequested.requested ? new Date().toISOString() : null,
      lastError: null,
    });
  } catch (error) {
    return withStateUpdate(submissionId, {
      status: "FAILED",
      turnitinSubmissionId: turnitinSubmissionId || null,
      lastError: toErrorMessage(error),
    });
  }
}

export async function refreshTurnitinSubmission(submissionId: string) {
  const cfg = resolveTurnitinRuntimeConfig();
  ensureTurnitinAvailable(cfg);

  const existing = getTurnitinSubmissionState(submissionId);
  const turnitinSubmissionId = String(existing?.turnitinSubmissionId || "").trim();
  if (!turnitinSubmissionId) {
    throw new TurnitinServiceError("No Turnitin submission id saved for this submission.", 400);
  }

  try {
    if (!String(existing?.reportRequestedAt || "").trim()) {
      const similarityRequested = await requestSimilarityWithFallback(cfg, turnitinSubmissionId);
      if (similarityRequested.deferred) {
        return withStateUpdate(submissionId, {
          status: "PROCESSING",
          lastError: null,
        });
      }
      withStateUpdate(submissionId, {
        status: "PROCESSING",
        reportRequestedAt: new Date().toISOString(),
        lastError: null,
      });
    }

    const similarity = await getTurnitinSimilarity({ cfg, turnitinSubmissionId });
    const status = normalizedStatus(similarity?.status);
    const next: Partial<TurnitinSubmissionState> = {
      turnitinSubmissionId,
      status,
      aiWritingPercentage: findAiPercentCandidate(similarity),
      overallMatchPercentage: sanitizeScore(similarity?.overall_match_percentage),
      internetMatchPercentage: sanitizeScore(similarity?.internet_match_percentage),
      publicationMatchPercentage: sanitizeScore(similarity?.publication_match_percentage),
      submittedWorksMatchPercentage: sanitizeScore(similarity?.submitted_works_match_percentage),
      reportRequestedAt: normalizeSimilarityTimestamp(similarity?.time_requested) || existing?.reportRequestedAt || null,
      reportGeneratedAt: normalizeSimilarityTimestamp(similarity?.time_generated),
      lastError: null,
    };

    const viewerUserId = chooseViewer(cfg);
    if (status === "COMPLETE" && viewerUserId) {
      try {
        const viewer = await createTurnitinViewerUrl({
          cfg,
          turnitinSubmissionId,
          viewerUserId,
          locale: cfg.locale,
        });
        const viewerUrl = String(viewer?.viewer_url || "").trim();
        if (viewerUrl) next.viewerUrl = viewerUrl;
      } catch {
        // Keep similarity result even if viewer URL request fails.
      }
    }
    return withStateUpdate(submissionId, next);
  } catch (error) {
    if (isInvalidSimilarityMetadataError(error)) {
      // Turnitin can reject refresh for stale/invalid IDs; re-create the submission instead.
      return sendSubmissionToTurnitin(submissionId);
    }
    if (isSimilarityDeferredConflict(error)) {
      return withStateUpdate(submissionId, {
        status: "PROCESSING",
        lastError: null,
      });
    }
    return withStateUpdate(submissionId, {
      status: "FAILED",
      lastError: toErrorMessage(error),
    });
  }
}

export async function refreshTurnitinViewerUrl(submissionId: string) {
  const cfg = resolveTurnitinRuntimeConfig();
  ensureTurnitinAvailable(cfg);
  const viewerUserId = chooseViewer(cfg);
  if (!viewerUserId) {
    throw new TurnitinServiceError("Turnitin viewer/owner user id is required in settings.", 400);
  }
  const existing = getTurnitinSubmissionState(submissionId);
  const turnitinSubmissionId = String(existing?.turnitinSubmissionId || "").trim();
  if (!turnitinSubmissionId) {
    throw new TurnitinServiceError("No Turnitin submission id saved for this submission.", 400);
  }
  try {
    const viewer = await createTurnitinViewerUrl({
      cfg,
      turnitinSubmissionId,
      viewerUserId,
      locale: cfg.locale,
    });
    const viewerUrl = String(viewer?.viewer_url || "").trim();
    if (!viewerUrl) throw new Error("Viewer URL missing in Turnitin response.");
    return withStateUpdate(submissionId, {
      viewerUrl,
      lastError: null,
    });
  } catch (error) {
    return withStateUpdate(submissionId, {
      lastError: toErrorMessage(error),
    });
  }
}

export async function syncTurnitinSubmission(submissionId: string) {
  const existing = getTurnitinSubmissionState(submissionId);
  if (shouldCreateFreshTurnitinSubmission(existing)) {
    return sendSubmissionToTurnitin(submissionId);
  }
  return refreshTurnitinSubmission(submissionId);
}

export async function maybeAutoSendTurnitinForSubmission(submissionId: string) {
  const cfg = resolveTurnitinRuntimeConfig();
  if (!cfg.enabled || !cfg.autoSendOnExtract) return null;
  if (cfg.qaOnly && !isQaLikeStage()) return null;
  const existing = getTurnitinSubmissionState(submissionId);
  if (existing?.turnitinSubmissionId && !shouldCreateFreshTurnitinSubmission(existing)) return existing;
  return sendSubmissionToTurnitin(submissionId);
}

export async function maybeAutoDetectAiWritingForSubmission(submissionId: string) {
  const cfg = resolveTurnitinRuntimeConfig();
  if (!cfg.enabled || !cfg.autoDetectAiWritingOnGrade) return null;
  if (cfg.qaOnly && !isQaLikeStage()) return null;
  try {
    return await syncTurnitinSubmission(submissionId);
  } catch (error) {
    const existing = getTurnitinSubmissionState(submissionId);
    return withStateUpdate(submissionId, {
      status: existing?.status || "FAILED",
      turnitinSubmissionId: existing?.turnitinSubmissionId || null,
      lastError: toErrorMessage(error),
    });
  }
}
