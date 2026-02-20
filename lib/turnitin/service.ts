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
    const refPart = error.reference ? `ref ${error.reference}` : "";
    return [core, statusPart, refPart].filter(Boolean).join(" · ");
  }
  if (error instanceof TurnitinServiceError) return error.message;
  return String((error as Error)?.message || error || "Unknown Turnitin error");
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
  await maybeEnsureOwnerEula(cfg, ownerUserId);

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
      lastError: null,
    });

    await uploadTurnitinOriginal({
      cfg,
      turnitinSubmissionId,
      storagePath: submission.storagePath,
      filename: submission.filename,
    });
    withStateUpdate(submissionId, {
      status: "UPLOADING",
      turnitinSubmissionId,
      lastError: null,
    });

    await requestTurnitinSimilarity({
      cfg,
      turnitinSubmissionId,
    });
    return withStateUpdate(submissionId, {
      status: "PROCESSING",
      turnitinSubmissionId,
      reportRequestedAt: new Date().toISOString(),
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
      reportRequestedAt: String(similarity?.time_requested || existing?.reportRequestedAt || "").trim() || null,
      reportGeneratedAt: String(similarity?.time_generated || "").trim() || null,
      lastError: null,
    };

    if (status === "COMPLETE" && cfg.viewerUserId) {
      try {
        const viewer = await createTurnitinViewerUrl({
          cfg,
          turnitinSubmissionId,
          viewerUserId: cfg.viewerUserId,
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
    return withStateUpdate(submissionId, {
      status: "FAILED",
      lastError: toErrorMessage(error),
    });
  }
}

export async function refreshTurnitinViewerUrl(submissionId: string) {
  const cfg = resolveTurnitinRuntimeConfig();
  ensureTurnitinAvailable(cfg);
  if (!cfg.viewerUserId) {
    throw new TurnitinServiceError("Turnitin viewer user id is required in settings.", 400);
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
      viewerUserId: cfg.viewerUserId,
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
  if (!existing?.turnitinSubmissionId) {
    return sendSubmissionToTurnitin(submissionId);
  }
  return refreshTurnitinSubmission(submissionId);
}

export async function maybeAutoSendTurnitinForSubmission(submissionId: string) {
  const cfg = resolveTurnitinRuntimeConfig();
  if (!cfg.enabled || !cfg.autoSendOnExtract) return null;
  if (cfg.qaOnly && !isQaLikeStage()) return null;
  const existing = getTurnitinSubmissionState(submissionId);
  if (existing?.turnitinSubmissionId) return existing;
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
