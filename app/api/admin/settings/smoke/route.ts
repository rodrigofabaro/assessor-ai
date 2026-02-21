import { NextResponse } from "next/server";
import { resolveOpenAiApiKey } from "@/lib/openai/client";
import { getSettingsReadContext } from "@/lib/admin/settingsPermissions";
import { readGradingConfig, type GradingConfig } from "@/lib/grading/config";
import { FEEDBACK_TEMPLATE_REQUIRED_TOKENS } from "@/lib/grading/feedbackDocument";

export const runtime = "nodejs";

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
  const missing = FEEDBACK_TEMPLATE_REQUIRED_TOKENS.filter((token) => !tpl.includes(token));
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
    .replaceAll("{date}", new Date().toISOString().slice(0, 10))
    .replaceAll("{studentFullName}", "Alex Carter")
    .replaceAll("{unitCode}", "4004")
    .replaceAll("{assignmentCode}", "A1")
    .replaceAll("{submissionId}", "sample-submission-id")
    .replaceAll("{confidence}", "0.84")
    .replaceAll("{gradingTone}", String(cfg.tone || "professional"))
    .replaceAll("{gradingStrictness}", String(cfg.strictness || "balanced"))
    .replaceAll(
      "{higherGradeGuidance}",
      "To reach the next band, ensure all higher-band criteria include explicit page-linked evidence."
    );

  if (sample.length > 9000) warnings.push("Template output is very long; review for verbosity.");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    samplePreview: sample.slice(0, 500),
  };
}

async function runAiSmoke(model?: string) {
  const keyCandidates = [
    resolveOpenAiApiKey("preferStandard"),
    resolveOpenAiApiKey("preferAdmin"),
  ].filter((k) => Boolean(k.apiKey));

  // De-duplicate when both preferences resolve to the same key.
  const tried = new Set<string>();
  const candidates = keyCandidates.filter((k) => {
    const key = String(k.apiKey || "");
    if (!key || tried.has(key)) return false;
    tried.add(key);
    return true;
  });

  if (!candidates.length) {
    return {
      ok: false,
      status: 0,
      keyType: null as string | null,
      message: "OPENAI_ADMIN_KEY or OPENAI_API_KEY is not configured.",
      modelAvailable: false,
    };
  }

  let lastFailure: { status: number; keyType: string; message: string } | null = null;
  for (const candidate of candidates) {
    const res = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${candidate.apiKey}`,
      },
      cache: "no-store",
    });
    const raw = await res.text();

    if (!res.ok) {
      lastFailure = {
        status: res.status,
        keyType: candidate.keyType,
        message: parseOpenAiMessage(raw),
      };
      continue;
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
      keyType: candidate.keyType,
      message: model && !modelAvailable ? `Connected, but model '${model}' was not returned by /v1/models.` : "Connected to OpenAI models endpoint.",
      modelAvailable,
    };
  }

  return {
    ok: false,
    status: lastFailure?.status || 0,
    keyType: lastFailure?.keyType || "none",
    message: lastFailure?.message || "OpenAI smoke check failed.",
    modelAvailable: false,
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
