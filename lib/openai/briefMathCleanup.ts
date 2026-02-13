import { readOpenAiModel } from "@/lib/openai/modelConfig";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";

type BriefTask = {
  n?: number;
  text?: string;
  prompt?: string;
  parts?: Array<{ key: string; text: string }>;
  warnings?: string[];
  confidence?: "CLEAN" | "HEURISTIC";
  aiCorrected?: boolean;
};

function normalizeExponentParens(text: string) {
  return String(text || "").replace(/\be\^\(\s*([^)]+)\s*\)/gi, (_m, exp) => `e^{${String(exp).trim()}}`);
}

function maybeRestoreLogEFromOriginal(original: string, cleaned: string) {
  const originalText = String(original || "");
  let next = String(cleaned || "");
  const hadLogLike = /\ble\(\s*[^)]+\s*\)/i.test(originalText) || /\blog\s*e\s*\(/i.test(originalText);
  if (!hadLogLike) return next;

  next = next.replace(/\blog\s*e\s*\(/gi, "log_e(");
  next = next.replace(/\ble\(\s*([^)]+)\s*\)/gi, (_m, arg) => `log_e(${String(arg).trim()})`);
  next = next.replace(/\be\^\{\s*([^}]+)\s*\}/gi, (_m, arg) => `log_e(${String(arg).trim()})`);
  next = next.replace(/\be\^\(\s*([^)]+)\s*\)/gi, (_m, arg) => `log_e(${String(arg).trim()})`);
  return next;
}

function hasBrokenMathLayout(text: string) {
  const s = String(text || "").replace(/−/g, "-");
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

function localMathRepair(text: string) {
  let out = String(text || "").replace(/−/g, "-");
  out = out.replace(/([A-Za-z\)])\s*\n\s*(\d{1,2})\b/g, "$1^$2");
  out = out.replace(/([A-Za-z0-9)\]}])\s*\n\s*([+\-][A-Za-z0-9(])/g, "$1 $2");
  out = out
    .replace(/\be\s*\n\s*-\s*([0-9.]+)\s*t\b/gi, "e^{-${1}t}")
    .replace(/\be\^\(\s*([^)]+)\s*\)/gi, "e^{$1}")
    .replace(/\bl\s+e\s*\n\s*\(/gi, "log_e(")
    .replace(/\ble\(\s*([^)]+)\s*\)/gi, "log_e($1)")
    .replace(/\blog\s*e\s*\(\s*([^)]+)\s*\)/gi, "log_e($1)")
    .replace(/\n{3,}/g, "\n\n");
  return out;
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
    "- Keep protected tokens exactly unchanged (e.g., [[EQ:p3-eq1]], [[IMG:p3-t2-img1]]).",
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

function collectEquationTokenIds(task: BriefTask) {
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
  return tokenIds;
}

function collectEquationTokenIdsFromFields(value: {
  text?: string;
  prompt?: string;
  parts?: Array<{ key: string; text: string }>;
}) {
  const tokenIds = new Set<string>();
  const collect = (srcValue: unknown) => {
    const src = String(srcValue || "");
    const re = /\[\[EQ:([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (m[1]) tokenIds.add(m[1]);
    }
  };
  collect(value.text);
  collect(value.prompt);
  for (const part of value.parts || []) collect(part?.text);
  return tokenIds;
}

function collectProtectedTokenIds(value: {
  text?: string;
  prompt?: string;
  parts?: Array<{ key: string; text: string }>;
}) {
  const tokenIds = new Set<string>();
  const collect = (srcValue: unknown) => {
    const src = String(srcValue || "");
    const re = /\[\[((?:EQ|IMG):[^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (m[1]) tokenIds.add(m[1]);
    }
  };
  collect(value.text);
  collect(value.prompt);
  for (const part of value.parts || []) collect(part?.text);
  return tokenIds;
}

function stripEquationTokens(value: string) {
  return String(value || "").replace(/\[\[EQ:[^\]]+\]\]/g, " ");
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
    const normalizedWarnings = warnings.filter((w) => !/openai math cleanup applied/i.test(w));
    if (!normalizedWarnings.length) {
      task.warnings = [];
      task.confidence = "CLEAN";
      continue;
    }

    const needsCleanup =
      normalizedWarnings.some((w) => /math layout: broken line wraps/i.test(w)) ||
      normalizedWarnings.some((w) => /equation quality: low-confidence/i.test(w));
    if (!needsCleanup) continue;

    const tokenIds = collectEquationTokenIds(task);
    // Fast deterministic fix for simple line-wrap math issues (no equation tokens required).
    if (tokenIds.size === 0) {
      task.text = localMathRepair(task.text || "");
      task.prompt = task.text;
      if (Array.isArray(task.parts) && task.parts.length) {
        task.parts = task.parts.map((part) => ({ ...part, text: localMathRepair(part?.text || "") }));
      }
      const stillBroken =
        hasBrokenMathLayout(task.text || "") ||
        (Array.isArray(task.parts) && task.parts.some((part) => hasBrokenMathLayout(part?.text || "")));
      const nextWarnings = new Set(
        normalizedWarnings.filter((w) => !/math layout: broken line wraps/i.test(w))
      );
      if (stillBroken) nextWarnings.add("math layout: broken line wraps");
      task.warnings = Array.from(nextWarnings);
      task.confidence = task.warnings.length ? "HEURISTIC" : "CLEAN";
      task.aiCorrected = false;
      changed += 1;
      continue;
    }

    const relatedEqs = Array.from(tokenIds)
      .map((id) => eqById.get(id))
      .filter(Boolean)
      .map((e: any) => ({ id: String(e.id), latex: e.latex ? String(e.latex) : null }));

    const cleaned = await cleanupTaskWithOpenAi(task, relatedEqs);
    if (!cleaned.ok) {
      failed += 1;
      const nextWarnings = new Set(normalizedWarnings);
      if (!/OpenAI 429/i.test(String(cleaned.reason || ""))) {
        nextWarnings.add(`openai cleanup skipped: ${cleaned.reason}`);
      }
      task.warnings = Array.from(nextWarnings);
      task.confidence = "HEURISTIC";
      continue;
    }

    // Safety: AI cleanup must not remove protected token coverage.
    const originalProtectedTokens = collectProtectedTokenIds(task);
    const cleanedProtectedTokens = collectProtectedTokenIds({
      text: cleaned.text,
      prompt: cleaned.text,
      parts: cleaned.parts,
    });
    const removedToken = Array.from(originalProtectedTokens).some((id) => !cleanedProtectedTokens.has(id));
    if (removedToken) {
      failed += 1;
      const nextWarnings = new Set(normalizedWarnings);
      nextWarnings.add("openai cleanup skipped: removed protected tokens");
      task.warnings = Array.from(nextWarnings);
      task.confidence = "HEURISTIC";
      task.aiCorrected = false;
      continue;
    }
    const originalTokens = collectEquationTokenIds(task);
    if (originalTokens.size > 0) {
      const cleanedJoined = [
        String(cleaned.text || ""),
        ...((cleaned.parts || []).map((p) => String(p?.text || ""))),
      ].join("\n");
      const rawLatexOutsideTokens = /\\(?:frac|sqrt|left|right|sin|cos|tan|log|ln)\b/.test(
        stripEquationTokens(cleanedJoined)
      );
      if (rawLatexOutsideTokens) {
        failed += 1;
        const nextWarnings = new Set(normalizedWarnings);
        nextWarnings.add("openai cleanup skipped: introduced raw latex");
        task.warnings = Array.from(nextWarnings);
        task.confidence = "HEURISTIC";
        task.aiCorrected = false;
        continue;
      }
    }

    task.text = cleaned.text;
    task.prompt = cleaned.text;
    task.text = normalizeExponentParens(task.text || "");
    task.prompt = normalizeExponentParens(task.prompt || "");
    if (cleaned.parts && cleaned.parts.length) {
      const originalByKey = new Map(
        (Array.isArray(task.parts) ? task.parts : []).map((p: any) => [String(p?.key || "").toLowerCase(), String(p?.text || "")])
      );
      task.parts = cleaned.parts.map((part) => {
        const key = String(part?.key || "").toLowerCase();
        const original = originalByKey.get(key) || "";
        let text = normalizeExponentParens(String(part?.text || ""));
        text = maybeRestoreLogEFromOriginal(original, text);
        return { ...part, text };
      });
    }

    const nextWarnings = new Set(
      (task.warnings || [])
        .map((w) => String(w))
        .filter((w) => !/math layout: broken line wraps/i.test(w))
        .filter((w) => !/equation quality: low-confidence/i.test(w))
        .filter((w) => !/openai math cleanup applied/i.test(w))
    );
    const remainingTokenIds = collectEquationTokenIds(task);
    const hasLowConfidenceEquationToken = Array.from(remainingTokenIds).some((id) => {
      const eq: any = eqById.get(id);
      if (!eq) return true;
      const conf = Number(eq?.confidence ?? 0);
      return !eq?.latex || conf < 0.85;
    });
    if (hasLowConfidenceEquationToken) {
      nextWarnings.add("equation quality: low-confidence");
    }
    if (hasBrokenMathLayout(task.text || "")) {
      nextWarnings.add("math layout: broken line wraps");
      task.confidence = "HEURISTIC";
      task.aiCorrected = false;
    } else {
      task.aiCorrected = true;
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
