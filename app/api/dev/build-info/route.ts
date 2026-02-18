import { execFileSync } from "node:child_process";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const BUILD_INFO_CACHE_TTL_MS = 30000;

type AiModes = {
  global: "openai" | "local" | "hybrid";
  cleanup: "openai" | "local" | "hybrid";
  ocr: "openai" | "local" | "hybrid";
  equation: "openai" | "local" | "hybrid";
  graph: "openai" | "local" | "hybrid";
  localEnabled: boolean;
};

type LocalAiHealth = {
  enabled: boolean;
  baseUrl: string;
  reachable: boolean;
  status: number;
  message: string;
  textModel: string;
  visionModel: string;
  modelCount?: number;
};

type RuntimeInfo = {
  node: string;
  pid: number;
  uptimeSec: number;
  rssMb: number;
};

type QueueInfo = {
  extractionRunsRunning: number;
  submissionsExtracting: number;
  submissionsAssessing: number;
  submissionsFailed: number;
};

type BuildInfoPayload = {
  branch: string;
  commit: string;
  dirty: boolean;
  changedFilesCount: number;
  changedFiles: string[];
  runtime: RuntimeInfo;
  queue: QueueInfo;
  aiModes: AiModes;
  localAi: LocalAiHealth;
  timestamp: number;
};

let cachedBuildInfo: BuildInfoPayload | null = null;

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();
}

function parseBool(value: string | undefined, fallback: boolean) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function normalizeMode(value: string | undefined): "openai" | "local" | "hybrid" {
  const v = String(value || "").trim().toLowerCase();
  if (v === "openai" || v === "local" || v === "hybrid") return v;
  return "hybrid";
}

function buildAiModes(): AiModes {
  const global = normalizeMode(process.env.AI_PROVIDER_MODE);
  return {
    global,
    cleanup: normalizeMode(process.env.AI_PROVIDER_CLEANUP_MODE || global),
    ocr: normalizeMode(process.env.AI_PROVIDER_OCR_MODE || global),
    equation: normalizeMode(process.env.AI_PROVIDER_EQUATION_MODE || global),
    graph: normalizeMode(process.env.AI_PROVIDER_GRAPH_MODE || global),
    localEnabled: parseBool(process.env.AI_LOCAL_ENABLED, true),
  };
}

function localBaseUrl() {
  return String(process.env.AI_LOCAL_BASE_URL || "http://127.0.0.1:11434").trim().replace(/\/+$/, "");
}

async function probeLocalAi(enabled: boolean): Promise<LocalAiHealth> {
  const baseUrl = localBaseUrl();
  const textModel = String(process.env.AI_LOCAL_TEXT_MODEL || process.env.AI_LOCAL_CLEANUP_MODEL || "qwen2.5:7b-instruct").trim();
  const visionModel = String(process.env.AI_LOCAL_VISION_MODEL || process.env.AI_LOCAL_OCR_MODEL || "llava:7b").trim();

  if (!enabled) {
    return {
      enabled,
      baseUrl,
      reachable: false,
      status: 0,
      message: "Local AI disabled by AI_LOCAL_ENABLED.",
      textModel,
      visionModel,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1800);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    const modelCount = Array.isArray(json?.models) ? json.models.length : undefined;
    return {
      enabled,
      baseUrl,
      reachable: res.ok,
      status: res.status,
      message: res.ok ? "Reachable" : String(json?.error || `Local AI error (${res.status})`),
      textModel,
      visionModel,
      modelCount,
    };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return {
      enabled,
      baseUrl,
      reachable: false,
      status: aborted ? 408 : 0,
      message: aborted ? "Probe timed out." : String(e?.message || "Probe failed."),
      textModel,
      visionModel,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const now = Date.now();
    if (cachedBuildInfo && now - cachedBuildInfo.timestamp < BUILD_INFO_CACHE_TTL_MS) {
      return NextResponse.json(cachedBuildInfo, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      });
    }

    const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    const commit = runGit(["rev-parse", "--short", "HEAD"]);
    const statusOutput = runGit(["status", "--porcelain"]);
    const changedFiles = statusOutput
      ? statusOutput.split("\n").map((line) => line.trim()).filter(Boolean)
      : [];

    const [localAi, queue] = await Promise.all([
      probeLocalAi(parseBool(process.env.AI_LOCAL_ENABLED, true)),
      (async (): Promise<QueueInfo> => {
        const [extractionRunsRunning, submissionsExtracting, submissionsAssessing, submissionsFailed] = await Promise.all([
          prisma.submissionExtractionRun.count({ where: { status: "RUNNING" } }),
          prisma.submission.count({ where: { status: "EXTRACTING" } }),
          prisma.submission.count({ where: { status: "ASSESSING" } }),
          prisma.submission.count({ where: { status: "FAILED" } }),
        ]);
        return { extractionRunsRunning, submissionsExtracting, submissionsAssessing, submissionsFailed };
      })(),
    ]);

    const payload: BuildInfoPayload = {
      branch,
      commit,
      dirty: changedFiles.length > 0,
      changedFilesCount: changedFiles.length,
      changedFiles: changedFiles.slice(0, 20),
      runtime: {
        node: process.version,
        pid: process.pid,
        uptimeSec: Math.max(0, Math.round(process.uptime())),
        rssMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
      },
      queue,
      aiModes: buildAiModes(),
      localAi,
      timestamp: now,
    };
    cachedBuildInfo = payload;

    return NextResponse.json(
      payload,
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  }
}
