import { readOpenAiModel } from "@/lib/openai/modelConfig";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";

type BriefTask = {
  n?: number;
  text?: string;
  prompt?: string;
  parts?: Array<{ key: string; text: string }>;
  warnings?: string[];
  confidence?: "CLEAN" | "HEURISTIC";
};

function hasBrokenMathLayout(text: string) {
  const s = String(text || "");
  if (!s) return false;
  if (/[A-Za-z\)]\s*\n\s*\d{1,2}\b/.test(s)) return true;
  if (/[=+\-*/]\s*\n\s*[A-Za-z0-9(]/.test(s)) return true;
  const tiny = s
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^[+\-*/=()0-9A-Za-z^]{1,3}$/.test(line)).length;
  return tiny >= 3;
}

function pickApiKey() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim().replace(/^['"]|['"]$/g, "");
  if (apiKey) return apiKey;
  const admin = String(process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_ADMIN_API_KEY || process.env.OPENAI_ADMIN || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  return admin || "";
}

function parseJsonObject(raw: string) {
  const clean = String(raw || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const obj = clean.match(/\{[\s\S]*\}/)?.[0] || "";
  if (!obj) return null;
  try {
    return JSON.parse(obj) as any;
  } catch {
    return null;
  }
}

function extractResponseText(data: any, raw: string) {
  const fromOutputText = String(data?.output_text || "").trim();
  if (fromOutputText) return fromOutputText;

  if (Array.isArray(data?.output)) {
    const joined = data.output
      .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
      .map((c: any) => String(c?.text || c?.output_text || c?.content || ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (joined) return joined;
  }

  const rawObj = parseJsonObject(raw);
  if (rawObj && typeof rawObj === "object") {
    return JSON.stringify(rawObj);
  }
  return "";
}

async function cleanupTaskWithOpenAi(task: BriefTask, equations: Array<{ id: string; latex: string | null }>) {
  const apiKey = pickApiKey();
  if (!apiKey) return { ok: false as const, reason: "OPENAI_API_KEY missing" };

  const model = readOpenAiModel().model;
  const prompt = [
    "You are fixing OCR-broken engineering math task text.",
    "Return strict JSON only.",
    'Schema: {"text":"...","parts":[{"key":"a","text":"..."},{"key":"b","text":"..."}]}',
    "Rules:",
    "- Preserve wording and task meaning.",
    "- Only fix broken math layout/wrap artifacts.",
    "- Convert stacked powers to inline powers (e.g., t newline 3 -> t^3).",
    "- Keep equation tokens like [[EQ:p3-eq1]] unchanged.",
    "- Do not add commentary.",
    "",
    `Task text:\n${String(task.text || "")}`,
    "",
    `Task parts JSON:\n${JSON.stringify(task.parts || [])}`,
    "",
    `Known equations JSON:\n${JSON.stringify(equations)}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_output_tokens: 1400,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
      }),
    });

    const raw = await res.text();
    if (!res.ok) return { ok: false as const, reason: `OpenAI ${res.status}` };

    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    if (data?.usage) {
      recordOpenAiUsage({
        model,
        op: "brief_task_math_cleanup",
        usage: data.usage,
      });
    }
    const outputText = extractResponseText(data, raw);
    const parsed = parseJsonObject(outputText);
    if (!parsed || typeof parsed !== "object") return { ok: false as const, reason: "Invalid cleanup JSON" };

    const nextText = String(parsed.text || "").trim();
    const nextParts = Array.isArray(parsed.parts)
      ? parsed.parts
          .map((p: any) => ({ key: String(p?.key || "").trim(), text: String(p?.text || "").trim() }))
          .filter((p: any) => p.key)
      : [];

    if (!nextText) return { ok: false as const, reason: "Empty cleanup output" };
    return {
      ok: true as const,
      text: nextText,
      parts: nextParts.length ? nextParts : undefined,
    };
  } catch {
    return { ok: false as const, reason: "OpenAI request failed" };
  }
}

export async function cleanupBriefTasksMathWithOpenAi(
  brief: any,
  opts?: { runCleanup?: boolean }
) {
  const cfg = readOpenAiModel();
  const runCleanup = typeof opts?.runCleanup === "boolean" ? opts.runCleanup : !!cfg.autoCleanupApproved;
  if (!runCleanup) return brief;

  const tasks: BriefTask[] = Array.isArray(brief?.tasks) ? brief.tasks : [];
  if (!tasks.length) return brief;

  const eqs = Array.isArray(brief?.equations) ? brief.equations : [];
  const eqById = new Map(eqs.map((e: any) => [String(e?.id || ""), e]));
  let changed = 0;
  let failed = 0;

  for (const task of tasks) {
    const warnings = Array.isArray(task.warnings) ? task.warnings.map((w) => String(w)) : [];
    const needsCleanup =
      warnings.some((w) => /math layout: broken line wraps/i.test(w)) ||
      warnings.some((w) => /equation quality: low-confidence/i.test(w));
    if (!needsCleanup) continue;

    const tokenIds = new Set<string>();
    const collect = (value: unknown) => {
      const src = String(value || "");
      const re = /\[\[EQ:([^\]]+)\]\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (m[1]) tokenIds.add(m[1]);
      }
    };
    collect(task.text);
    collect(task.prompt);
    for (const part of task.parts || []) collect(part?.text);

    const relatedEqs = Array.from(tokenIds)
      .map((id) => eqById.get(id))
      .filter(Boolean)
      .map((e: any) => ({ id: String(e.id), latex: e.latex ? String(e.latex) : null }));

    const cleaned = await cleanupTaskWithOpenAi(task, relatedEqs);
    if (!cleaned.ok) {
      failed += 1;
      const nextWarnings = new Set(warnings);
      nextWarnings.add(`openai cleanup skipped: ${cleaned.reason}`);
      task.warnings = Array.from(nextWarnings);
      task.confidence = "HEURISTIC";
      continue;
    }

    task.text = cleaned.text;
    task.prompt = cleaned.text;
    if (cleaned.parts && cleaned.parts.length) {
      task.parts = cleaned.parts;
    }

    const nextWarnings = new Set(
      (task.warnings || [])
        .map((w) => String(w))
        .filter((w) => !/math layout: broken line wraps/i.test(w))
    );
    if (hasBrokenMathLayout(task.text || "")) {
      nextWarnings.add("math layout: broken line wraps");
      task.confidence = "HEURISTIC";
    } else {
      nextWarnings.add("openai math cleanup applied");
      task.confidence = nextWarnings.size ? "HEURISTIC" : "CLEAN";
    }
    task.warnings = Array.from(nextWarnings);
    changed += 1;
  }

  const briefWarnings = Array.isArray(brief?.warnings) ? brief.warnings.map((w: any) => String(w)) : [];
  if (changed > 0) briefWarnings.push(`openai task cleanup applied: ${changed}`);
  if (failed > 0) briefWarnings.push(`openai task cleanup skipped: ${failed}`);
  if (briefWarnings.length) brief.warnings = Array.from(new Set(briefWarnings));

  return brief;
}
