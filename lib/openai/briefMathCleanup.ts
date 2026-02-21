import { readOpenAiModel } from "@/lib/openai/modelConfig";
import { buildResponsesTemperatureParam } from "@/lib/openai/responsesParams";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";
import { fetchOpenAiJson, resolveOpenAiApiKey } from "@/lib/openai/client";
import { localJsonText, shouldTryLocal, shouldTryOpenAi } from "@/lib/ai/hybrid";

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
  const normalizeEquationLine = (line: string) => {
    const src = String(line || "");
    if (!/\b[a-z]\s*=/i.test(src)) return src;
    return src.replace(/([A-Za-z\)])\s+(\d{1,2})(?=\s*[\)+\-*/]|$)/g, "$1^$2");
  };

  return String(text || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\be\^\(\s*([^)]+)\s*\)/gi, (_m, exp) => `e^{${String(exp).trim()}}`)
    .replace(/\be\^\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
    .replace(/\be\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
    .replace(/\be-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
    .replace(/\be\^\{\s*-\s*([0-9.]+)\s*t\s*\}/gi, (_m, exp) => `e^{-${String(exp).trim()}t}`)
    .split("\n")
    .map(normalizeEquationLine)
    .join("\n");
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
  let out = String(text || "").replace(/−/g, "-").replace(/[\u200B-\u200D\uFEFF]/g, "");
  out = out.replace(/([A-Za-z\)])\s*\n\s*(\d{1,2})\b/g, "$1^$2");
  out = out.replace(/([A-Za-z0-9)\]}])\s*\n\s*([+\-][A-Za-z0-9(])/g, "$1 $2");
  out = out
    .replace(/\be\s*\n\s*-\s*([0-9.]+)\s*t\b/gi, "e^{-${1}t}")
    .replace(/\be\^\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
    .replace(/\be\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
    .replace(/\be-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
    .replace(/\be\^\(\s*([^)]+)\s*\)/gi, "e^{$1}")
    .replace(/\bl\s+e\s*\n\s*\(/gi, "log_e(")
    .replace(/\ble\(\s*([^)]+)\s*\)/gi, "log_e($1)")
    .replace(/\blog\s*e\s*\(\s*([^)]+)\s*\)/gi, "log_e($1)")
    .replace(/\n{3,}/g, "\n\n");
  return out;
}

function pickApiKey() {
  return resolveOpenAiApiKey("preferStandard").apiKey;
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

  const parseCleanup = (parsed: any) => {
    if (!parsed || typeof parsed !== "object") return null;
    const nextText = String(parsed.text || "").trim();
    const nextParts = Array.isArray(parsed.parts)
      ? parsed.parts
          .map((p: any) => ({ key: String(p?.key || "").trim(), text: String(p?.text || "").trim() }))
          .filter((p: any) => p.key)
      : [];
    if (!nextText) return null;
    return {
      text: nextText,
      parts: nextParts.length ? nextParts : undefined,
    };
  };

  if (shouldTryLocal("cleanup")) {
    const local = await localJsonText("cleanup", prompt, {
      timeoutMs: Number(process.env.AI_LOCAL_CLEANUP_TIMEOUT_MS || process.env.AI_LOCAL_TIMEOUT_MS || 25000),
    });
    if (local.ok) {
      const localParsed = "parsed" in local ? local.parsed : null;
      const localText = "text" in local ? local.text : "";
      const parsed = parseCleanup(localParsed || parseJsonObject(localText || ""));
      if (parsed) return { ok: true as const, ...parsed };
    }
    if (!shouldTryOpenAi("cleanup")) {
      return { ok: false as const, reason: local.message || "Local cleanup failed" };
    }
  }

  const apiKey = pickApiKey();
  if (!apiKey) return { ok: false as const, reason: "OPENAI_API_KEY missing" };
  const model = readOpenAiModel().model;

  try {
    const res = await fetchOpenAiJson(
      "/v1/responses",
      apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        model,
        ...buildResponsesTemperatureParam(model, 0),
        max_output_tokens: Number(process.env.OPENAI_CLEANUP_MAX_OUTPUT_TOKENS || 900),
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
      }),
      },
      {
        timeoutMs: Number(process.env.OPENAI_CLEANUP_TIMEOUT_MS || 30000),
        retries: Number(process.env.OPENAI_CLEANUP_RETRIES || 1),
      }
    );

    if (!res.ok) return { ok: false as const, reason: `OpenAI ${res.status}: ${res.message}` };
    const raw = JSON.stringify(res.json || {});

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
    const parsed = parseCleanup(parseJsonObject(outputText));
    if (!parsed) return { ok: false as const, reason: "Invalid cleanup JSON" };
    return { ok: true as const, ...parsed };
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

function stripSelectedEquationTokens(value: string, ids: Set<string>) {
  return String(value || "").replace(/\[\[EQ:([^\]]+)\]\]/g, (_m, id) => (ids.has(String(id || "")) ? "" : `[[EQ:${id}]]`));
}

function hasStrictMathIntent(value: string) {
  const src = String(value || "");
  if (!src.trim()) return false;
  if (/[=^]/.test(src) && /\b[a-z]\b/i.test(src)) return true;
  if (/\b(log\s*\(|log[_\s]*e\b|ln\s*\(|natural\s+log)\b/i.test(src)) return true;
  return /\b(equation|differentiate|differentiation|derivative|integrate|integration|integral|calculate|calculation|solve|sine|cosine|tangent|sin|cos|tan)\b/i.test(src);
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
  const applyTaskTextTransform = (task: BriefTask, transform: (value: string) => string) => {
    task.text = transform(String(task.text || ""));
    task.prompt = task.text;
    if (Array.isArray(task.parts) && task.parts.length) {
      task.parts = task.parts.map((part) => ({ ...part, text: transform(String(part?.text || "")) }));
    }
  };
  const setTaskWarningState = (
    task: BriefTask,
    nextWarnings: Set<string>,
    options?: { aiCorrected?: boolean; forceHeuristic?: boolean }
  ) => {
    const warnings = Array.from(nextWarnings);
    task.warnings = warnings;
    task.confidence = options?.forceHeuristic ? "HEURISTIC" : warnings.length ? "HEURISTIC" : "CLEAN";
    if (typeof options?.aiCorrected === "boolean") task.aiCorrected = options.aiCorrected;
  };
  const setCleanupSkipped = (task: BriefTask, baseWarnings: string[], reason: string) => {
    const nextWarnings = new Set(baseWarnings);
    const debugWarnings = ["1", "true", "yes", "on"].includes(
      String(process.env.OPENAI_CLEANUP_DEBUG_WARNINGS || "").toLowerCase()
    );
    if (debugWarnings) nextWarnings.add(reason);
    setTaskWarningState(task, nextWarnings, { aiCorrected: false, forceHeuristic: true });
  };
  const localRepairTaskMath = (task: BriefTask) => {
    applyTaskTextTransform(task, (value) => localMathRepair(value));
    const stillBroken =
      hasBrokenMathLayout(task.text || "") ||
      (Array.isArray(task.parts) && task.parts.some((part) => hasBrokenMathLayout(part?.text || "")));
    const nextWarnings = new Set(
      (Array.isArray(task.warnings) ? task.warnings : [])
        .map((w) => String(w))
        .filter((w) => !/math layout: broken line wraps/i.test(w))
        .filter((w) => !/openai math cleanup applied/i.test(w))
    );
    if (stillBroken) nextWarnings.add("math layout: broken line wraps");
    setTaskWarningState(task, nextWarnings, { aiCorrected: false });
  };

  for (const task of tasks) {
    const warnings = Array.isArray(task.warnings) ? task.warnings.map((w) => String(w)) : [];
    const normalizedWarnings = warnings.filter((w) => !/openai math cleanup applied/i.test(w));
    if (!normalizedWarnings.length) {
      setTaskWarningState(task, new Set<string>());
      continue;
    }

    const needsCleanup =
      normalizedWarnings.some((w) => /math layout: broken line wraps/i.test(w)) ||
      normalizedWarnings.some((w) => /equation quality: low-confidence/i.test(w));
    if (!needsCleanup) continue;

    const tokenIds = collectEquationTokenIds(task);
    // Fast deterministic fix for simple line-wrap math issues (no equation tokens required).
    if (tokenIds.size === 0) {
      localRepairTaskMath(task);
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
      if (!/OpenAI 429/i.test(String(cleaned.reason || ""))) {
        setCleanupSkipped(task, normalizedWarnings, `openai cleanup skipped: ${cleaned.reason}`);
      } else {
        setTaskWarningState(task, new Set(normalizedWarnings), { forceHeuristic: true });
      }
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
      setCleanupSkipped(task, normalizedWarnings, "openai cleanup skipped: removed protected tokens");
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
        setCleanupSkipped(task, normalizedWarnings, "openai cleanup skipped: introduced raw latex");
        continue;
      }
    }

    task.text = normalizeExponentParens(String(cleaned.text || ""));
    task.prompt = task.text;
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
    let remainingTokenIds = collectEquationTokenIds(task);
    const weakTokenIds = Array.from(remainingTokenIds).filter((id) => {
      const eq: any = eqById.get(id);
      if (!eq) return true;
      const conf = Number(eq?.confidence ?? 0);
      return !eq?.latex || conf < 0.85;
    });
    const hasLowConfidenceEquationToken = weakTokenIds.length > 0;
    const strippedTextForIntent = [
      String(task.text || ""),
      ...((task.parts || []).map((p: any) => String(p?.text || ""))),
    ]
      .join("\n")
      .replace(/\[\[EQ:[^\]]+\]\]/g, " ");
    if (
      hasLowConfidenceEquationToken &&
      weakTokenIds.length === remainingTokenIds.size &&
      !hasStrictMathIntent(strippedTextForIntent)
    ) {
      const weakSet = new Set(weakTokenIds);
      applyTaskTextTransform(task, (value) => stripSelectedEquationTokens(value, weakSet));
      remainingTokenIds = collectEquationTokenIds(task);
    }
    const hasLowConfidenceAfterPrune = Array.from(remainingTokenIds).some((id) => {
      const eq: any = eqById.get(id);
      if (!eq) return true;
      const conf = Number(eq?.confidence ?? 0);
      return !eq?.latex || conf < 0.85;
    });
    if (hasLowConfidenceAfterPrune) {
      nextWarnings.add("equation quality: low-confidence");
    }
    if (hasBrokenMathLayout(task.text || "")) {
      nextWarnings.add("math layout: broken line wraps");
      setTaskWarningState(task, nextWarnings, { aiCorrected: true, forceHeuristic: true });
    } else {
      setTaskWarningState(task, nextWarnings, { aiCorrected: true });
    }
    changed += 1;
  }

  const briefWarnings = Array.isArray(brief?.warnings) ? brief.warnings.map((w: any) => String(w)) : [];
  const nextBriefWarnings = briefWarnings.filter(
    (w) =>
      !/^openai task cleanup applied:\s*\d+/i.test(w) &&
      !/^openai task cleanup skipped:\s*\d+/i.test(w)
  );
  if (changed > 0) nextBriefWarnings.push(`openai task cleanup applied: ${changed}`);
  if (failed > 0) nextBriefWarnings.push(`openai task cleanup skipped: ${failed}`);
  brief.warnings = nextBriefWarnings.length ? Array.from(new Set(nextBriefWarnings)) : undefined;

  return brief;
}
