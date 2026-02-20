import { NextResponse } from "next/server";
import { resolveOpenAiApiKey } from "@/lib/openai/client";
import { getSettingsReadContext } from "@/lib/admin/settingsPermissions";
import { readGradingConfig, type GradingConfig } from "@/lib/grading/config";

export const runtime = "nodejs";

const REQUIRED_TEMPLATE_TOKENS = ["{overallGrade}", "{feedbackBullets}"] as const;

type SmokeTarget = "ai" | "grading" | "all";

type SmokeBody = {
  target?: SmokeTarget;
  ai?: {
    model?: string;
  };
  grading?: Partial<GradingConfig>;
};

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function parseOpenAiMessage(raw: string) {
  if (!raw) return "Unknown error";
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    const msg = String(parsed?.error?.message || "").trim();
    if (msg) return msg;
  } catch {
    // fall through
  }
  return raw.replace(/\s+/g, " ").trim().slice(0, 280) || "Unknown error";
}

function runGradingSmoke(input?: Partial<GradingConfig>) {
  const base = readGradingConfig().config;
  const cfg = { ...base, ...(input || {}) } as GradingConfig;
  const errors: string[] = [];
  const warnings: string[] = [];

  const tpl = String(cfg.feedbackTemplate || "").trim();
  if (!tpl) errors.push("Feedback template is empty.");
  const missing = REQUIRED_TEMPLATE_TOKENS.filter((token) => !tpl.includes(token));
  if (missing.length) errors.push(`Feedback template missing required placeholders: ${missing.join(", ")}.`);

  const bullets = toInt(cfg.maxFeedbackBullets, 6);
  if (bullets < 3 || bullets > 12) errors.push("Feedback bullets must be between 3 and 12.");

  const maxPages = toInt(cfg.pageNotesMaxPages, 6);
  if (maxPages < 1 || maxPages > 20) errors.push("Max pages with notes must be between 1 and 20.");

  const maxLines = toInt(cfg.pageNotesMaxLinesPerPage, 3);
  if (maxLines < 1 || maxLines > 8) errors.push("Max notes per page must be between 1 and 8.");

  if (!cfg.pageNotesEnabled && maxPages > 0) {
    warnings.push("Page-note limits are set but page notes are currently disabled.");
  }

  const sample = tpl
    .replaceAll("{studentFirstName}", "Alex")
    .replaceAll("{feedbackSummary}", "Your submission demonstrates sound structure.")
    .replaceAll("{feedbackBullets}", "- Strength: clear structure\n- Improve: add more explicit criterion evidence")
    .replaceAll("{overallGrade}", "PASS")
    .replaceAll("{assessorName}", "Assessor AI")
    .replaceAll("{date}", new Date().toISOString().slice(0, 10));

  if (sample.length > 9000) warnings.push("Template output is very long; review for verbosity.");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    samplePreview: sample.slice(0, 500),
  };
}

async function runAiSmoke(model?: string) {
  const { apiKey, keyType } = resolveOpenAiApiKey("preferAdmin");
  if (!apiKey) {
    return {
      ok: false,
      status: 0,
      keyType: null as string | null,
      message: "OPENAI_ADMIN_KEY or OPENAI_API_KEY is not configured.",
      modelAvailable: false,
    };
  }

  const res = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  const raw = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      keyType,
      message: parseOpenAiMessage(raw),
      modelAvailable: false,
    };
  }

  let modelAvailable = true;
  if (model) {
    try {
      const parsed = JSON.parse(raw) as { data?: Array<{ id?: string }> };
      const ids = Array.isArray(parsed?.data) ? parsed.data.map((m) => String(m?.id || "")) : [];
      modelAvailable = ids.includes(model);
    } catch {
      modelAvailable = true;
    }
  }

  return {
    ok: true,
    status: res.status,
    keyType,
    message: model && !modelAvailable ? `Connected, but model '${model}' was not returned by /v1/models.` : "Connected to OpenAI models endpoint.",
    modelAvailable,
  };
}

export async function POST(req: Request) {
  const readCtx = await getSettingsReadContext();
  if (!readCtx.canRead) {
    return NextResponse.json({ error: "Insufficient role for settings read." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as SmokeBody;
  const target = (body.target || "all") as SmokeTarget;
  const out: Record<string, unknown> = {
    ok: true,
    target,
    checkedAt: new Date().toISOString(),
  };

  if (target === "ai" || target === "all") {
    const ai = await runAiSmoke(String(body.ai?.model || "").trim() || undefined);
    out.ai = ai;
    if (!ai.ok) out.ok = false;
  }

  if (target === "grading" || target === "all") {
    const grading = runGradingSmoke(body.grading);
    out.grading = grading;
    if (!grading.ok) out.ok = false;
  }

  return NextResponse.json(out);
}
