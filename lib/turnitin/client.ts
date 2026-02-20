import fs from "node:fs/promises";
import path from "node:path";
import type { ResolvedTurnitinConfig } from "@/lib/turnitin/config";

export class TurnitinApiError extends Error {
  status: number;
  code: string | null;
  reference: string | null;
  debugMessage: string | null;
  payload: unknown;

  constructor(input: {
    message: string;
    status: number;
    code?: string | null;
    reference?: string | null;
    debugMessage?: string | null;
    payload?: unknown;
  }) {
    super(input.message);
    this.name = "TurnitinApiError";
    this.status = Number(input.status || 0);
    this.code = input.code || null;
    this.reference = input.reference || null;
    this.debugMessage = input.debugMessage || null;
    this.payload = input.payload;
  }
}

function apiPath(input: string) {
  const raw = String(input || "").trim();
  if (!raw.startsWith("/")) return `/api/v1/${raw}`;
  if (raw.startsWith("/api/")) return raw;
  return `/api/v1${raw}`;
}

function asText(payload: unknown) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const rec = payload as Record<string, unknown>;
  return String(rec.message || rec.debug_message || "").trim();
}

function parseJsonMaybe(raw: string) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

type TurnitinRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  rawBody?: Buffer;
  contentType?: string;
};

async function turnitinRequest<T = any>(
  cfg: ResolvedTurnitinConfig,
  pathInput: string,
  opts?: TurnitinRequestOptions
): Promise<T> {
  const url = `${cfg.baseUrl}${apiPath(pathInput)}`;
  const method = opts?.method || "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "X-Turnitin-Integration-Name": cfg.integrationName || "assessor-ai",
    "X-Turnitin-Integration-Version": cfg.integrationVersion || "1.0.0",
  };

  let body: string | Buffer | undefined;
  if (opts?.rawBody) {
    body = opts.rawBody;
    headers["Content-Type"] = opts.contentType || "application/octet-stream";
    headers["Content-Length"] = String(opts.rawBody.length);
  } else if (typeof opts?.body !== "undefined") {
    body = JSON.stringify(opts.body);
    headers["Content-Type"] = opts.contentType || "application/json";
    headers["Content-Length"] = String(Buffer.byteLength(body));
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body as BodyInit | null | undefined,
    cache: "no-store",
  });

  const raw = await res.text();
  const parsed = parseJsonMaybe(raw);
  if (!res.ok) {
    const payload = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const message = asText(payload) || raw || `Turnitin request failed (${res.status})`;
    throw new TurnitinApiError({
      message,
      status: res.status,
      code: String(payload.code || "").trim() || null,
      reference: String(payload.reference || "").trim() || null,
      debugMessage: String(payload.debug_message || "").trim() || null,
      payload: parsed ?? raw,
    });
  }

  return (parsed ?? (raw as unknown)) as T;
}

export async function getTurnitinFeatures(cfg: ResolvedTurnitinConfig) {
  return turnitinRequest<Record<string, unknown>>(cfg, "/features-enabled", { method: "GET" });
}

export async function getTurnitinLatestEula(cfg: ResolvedTurnitinConfig) {
  return turnitinRequest<{ version?: string; available_languages?: string[] }>(cfg, "/eula/latest", {
    method: "GET",
  });
}

export async function acceptTurnitinEula(input: {
  cfg: ResolvedTurnitinConfig;
  userId: string;
  locale?: string;
}) {
  const latest = await getTurnitinLatestEula(input.cfg);
  const version = String(latest?.version || "").trim();
  if (!version) return null;
  const language = String(input.locale || input.cfg.locale || "en-US").trim() || "en-US";
  return turnitinRequest(input.cfg, `/eula/${encodeURIComponent(version)}/accept`, {
    method: "POST",
    body: {
      user_id: input.userId,
      accepted_timestamp: new Date().toISOString(),
      language,
    },
  });
}

export async function createTurnitinSubmission(input: {
  cfg: ResolvedTurnitinConfig;
  owner: string;
  title: string;
}) {
  return turnitinRequest<{
    id: string;
    status?: string;
    owner?: string;
    title?: string;
    created_time?: string;
  }>(input.cfg, "/submissions", {
    method: "POST",
    body: {
      owner: input.owner,
      title: input.title,
    },
  });
}

function mimeFromFilename(filename: string) {
  const ext = path.extname(String(filename || "").toLowerCase()).replace(".", "");
  if (ext === "pdf") return "application/pdf";
  if (ext === "doc") return "application/msword";
  if (ext === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "txt") return "text/plain";
  if (ext === "rtf") return "application/rtf";
  return "application/octet-stream";
}

export async function uploadTurnitinOriginal(input: {
  cfg: ResolvedTurnitinConfig;
  turnitinSubmissionId: string;
  storagePath: string;
  filename: string;
}) {
  const file = await fs.readFile(input.storagePath);
  const name = String(input.filename || "submission.pdf").trim() || "submission.pdf";
  const queryName = encodeURIComponent(name);
  return turnitinRequest(input.cfg, `/submissions/${input.turnitinSubmissionId}/original?filename=${queryName}`, {
    method: "PUT",
    rawBody: file,
    contentType: mimeFromFilename(name),
  });
}

export async function requestTurnitinSimilarity(input: {
  cfg: ResolvedTurnitinConfig;
  turnitinSubmissionId: string;
}) {
  return turnitinRequest(input.cfg, `/submissions/${input.turnitinSubmissionId}/similarity`, {
    method: "PUT",
    body: {
      generation_settings: {
        search_repositories: [
          "INTERNET",
          "PUBLICATION",
          "CROSSREF",
          "CROSSREF_POSTED_CONTENT",
          "SUBMITTED_WORK",
        ],
      },
    },
  });
}

export async function getTurnitinSimilarity(input: {
  cfg: ResolvedTurnitinConfig;
  turnitinSubmissionId: string;
}) {
  return turnitinRequest<{
    status?: string;
    overall_match_percentage?: number;
    internet_match_percentage?: number;
    publication_match_percentage?: number;
    submitted_works_match_percentage?: number;
    time_requested?: string;
    time_generated?: string;
  }>(input.cfg, `/submissions/${input.turnitinSubmissionId}/similarity`, { method: "GET" });
}

export async function createTurnitinViewerUrl(input: {
  cfg: ResolvedTurnitinConfig;
  turnitinSubmissionId: string;
  viewerUserId: string;
  locale?: string;
}) {
  return turnitinRequest<{ viewer_url?: string }>(
    input.cfg,
    `/submissions/${input.turnitinSubmissionId}/viewer-url`,
    {
      method: "POST",
      body: {
        locale: String(input.locale || input.cfg.locale || "en-US"),
        viewer_user_id: String(input.viewerUserId || "").trim(),
      },
    }
  );
}
