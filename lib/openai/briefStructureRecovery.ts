import { localJsonText, shouldTryLocal, shouldTryOpenAi } from "@/lib/ai/hybrid";
import { fetchOpenAiJson, resolveOpenAiApiKey } from "@/lib/openai/client";
import { readOpenAiModel } from "@/lib/openai/modelConfig";
import { buildResponsesTemperatureParam } from "@/lib/openai/responsesParams";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";

type BriefPart = { key: string; text: string };
type BriefTask = {
  n?: number;
  label?: string;
  text?: string;
  prompt?: string;
  parts?: BriefPart[];
  pages?: Array<number | string>;
  warnings?: string[];
  confidence?: "CLEAN" | "HEURISTIC";
  aiCorrected?: boolean;
};

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

function normalizeTaskNumber(value: unknown, fallback: number) {
  const n = Number(value);
  if (Number.isInteger(n) && n > 0 && n < 100) return n;
  return fallback;
}

function sanitizePart(raw: any): BriefPart | null {
  const key = String(raw?.key || "").trim().toLowerCase();
  const text = String(raw?.text || "").trim();
  if (!key || !text) return null;
  return { key, text };
}

function sanitizeRecoveredTasks(input: any): BriefTask[] {
  const tasks = Array.isArray(input?.tasks) ? input.tasks : [];
  const out: BriefTask[] = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const raw = tasks[i] || {};
    const n = normalizeTaskNumber(raw?.n, i + 1);
    const text = String(raw?.text || "").trim();
    const parts = (Array.isArray(raw?.parts) ? raw.parts.map(sanitizePart).filter(Boolean) : []) as BriefPart[];
    const rebuilt = parts.length ? parts.map((p) => `${p.key}) ${p.text}`).join("\n\n") : "";
    const finalText = text || rebuilt;
    if (!finalText || finalText.length < 20) continue;
    out.push({
      n,
      label: `Task ${n}`,
      text: finalText,
      prompt: finalText,
      parts: parts.length ? parts : undefined,
    });
  }
  return out.sort((a, b) => Number(a.n || 0) - Number(b.n || 0));
}

function mergeRecoveredTasks(existing: BriefTask[], recovered: BriefTask[]): BriefTask[] {
  if (!existing.length || !recovered.length) return existing;
  const recoveredByN = new Map<number, BriefTask>();
  for (const t of recovered) {
    const n = Number(t.n || 0);
    if (n > 0) recoveredByN.set(n, t);
  }

  let replaced = 0;
  const merged = existing.map((task) => {
    const n = Number(task?.n || 0);
    const rec = recoveredByN.get(n);
    if (!rec) return task;
    const prevText = String(task?.text || "").trim();
    const nextText = String(rec?.text || "").trim();
    if (!nextText) return task;
    if (prevText && nextText.length < Math.max(20, Math.floor(prevText.length * 0.55))) return task;
    replaced += 1;
    const warnings = new Set((Array.isArray(task?.warnings) ? task.warnings : []).map((w) => String(w)));
    warnings.add("ai structure recovery applied");
    return {
      ...task,
      text: nextText,
      prompt: nextText,
      parts: Array.isArray(rec.parts) && rec.parts.length ? rec.parts : task.parts,
      warnings: Array.from(warnings),
      confidence: "HEURISTIC" as const,
      aiCorrected: true,
    };
  });

  // Safety guard: refuse tiny-impact or over-aggressive rewrites.
  if (replaced <= 0 || replaced > Math.ceil(existing.length * 0.9)) return existing;
  return merged;
}

function buildPrompt(input: { title: string; sourceText: string; tasks: BriefTask[] }) {
  const compactTasks = (input.tasks || []).map((t) => ({
    n: t.n,
    text: String(t.text || "").slice(0, 1200),
    parts: Array.isArray(t.parts) ? t.parts : [],
    warnings: Array.isArray(t.warnings) ? t.warnings : [],
  }));

  return [
    "Repair assignment brief task structure from OCR text.",
    "Return strict JSON only.",
    'Schema: {"tasks":[{"n":number,"text":"...","parts":[{"key":"a|b|1|2|a.i","text":"..."}]}]}',
    "Rules:",
    "- Preserve original wording and order.",
    "- Keep task numbering stable.",
    "- Split into parts when explicit markers exist (a,b,1,2,i,ii).",
    "- Keep equation/image tokens exactly unchanged, e.g. [[EQ:...]] [[IMG:...]].",
    "- Do not invent missing data.",
    "",
    `Brief title: ${String(input.title || "").trim()}`,
    "",
    "Current extracted tasks JSON:",
    JSON.stringify(compactTasks, null, 2),
    "",
    "Source OCR text (truncated):",
    String(input.sourceText || "").slice(0, 40000),
  ].join("\n");
}

async function recoverWithOpenAi(prompt: string): Promise<{ tasks: BriefTask[]; mode: "openai" } | null> {
  const apiKey = String(resolveOpenAiApiKey("preferStandard").apiKey || "");
  if (!apiKey) return null;
  const model = String(process.env.OPENAI_BRIEF_STRUCTURE_MODEL || readOpenAiModel().model || "").trim();
  if (!model) return null;
  const res = await fetchOpenAiJson(
    "/v1/responses",
    apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        ...buildResponsesTemperatureParam(model, 0),
        max_output_tokens: Number(process.env.OPENAI_BRIEF_STRUCTURE_MAX_OUTPUT_TOKENS || 2200),
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      }),
    },
    {
      timeoutMs: Number(process.env.OPENAI_BRIEF_STRUCTURE_TIMEOUT_MS || 45000),
      retries: Number(process.env.OPENAI_BRIEF_STRUCTURE_RETRIES || 1),
    }
  );
  if (!res.ok) return null;
  const data: any = res.json;
  recordOpenAiUsage({ model, op: "brief_structure_recovery", usage: data?.usage });
  const fromOutputText = String(data?.output_text || "").trim();
  const fromOutput = Array.isArray(data?.output)
    ? data.output
        .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
        .map((c: any) => String(c?.text || c?.output_text || ""))
        .join("\n")
        .trim()
    : "";
  const parsed = parseJsonObject(fromOutputText || fromOutput || "");
  if (!parsed) return null;
  const tasks = sanitizeRecoveredTasks(parsed);
  if (!tasks.length) return null;
  return { tasks, mode: "openai" };
}

export async function recoverBriefStructureWithAi(
  brief: any,
  sourceText: string
): Promise<{ brief: any; applied: boolean; mode?: "local" | "openai"; reason?: string }> {
  const enabled = /^(1|true|yes)$/i.test(String(process.env.AI_BRIEF_STRUCTURE_RECOVERY || "false"));
  if (!enabled) return { brief, applied: false, reason: "disabled" };
  const tasks = Array.isArray(brief?.tasks) ? (brief.tasks as BriefTask[]) : [];
  if (!tasks.length) return { brief, applied: false, reason: "no_tasks" };

  const hasRecoverySignal = tasks.some((t) => {
    const warnings = (Array.isArray(t?.warnings) ? t.warnings : []).map((w) => String(w).toLowerCase());
    return warnings.some((w) => /suspiciously short|broken line wraps|task headings not found/.test(w));
  });
  if (!hasRecoverySignal) return { brief, applied: false, reason: "no_signal" };

  const prompt = buildPrompt({
    title: String(brief?.title || brief?.header?.assignmentTitle || ""),
    sourceText: String(sourceText || ""),
    tasks,
  });

  if (shouldTryLocal("cleanup")) {
    const local = await localJsonText("cleanup", prompt, {
      timeoutMs: Number(process.env.AI_LOCAL_BRIEF_STRUCTURE_TIMEOUT_MS || process.env.AI_LOCAL_TIMEOUT_MS || 35000),
    });
    if (local.ok) {
      const parsed = parseJsonObject(String("text" in local ? local.text : "")) || ("parsed" in local ? local.parsed : null);
      const recovered = sanitizeRecoveredTasks(parsed);
      const merged = mergeRecoveredTasks(tasks, recovered);
      if (merged !== tasks) {
        return {
          brief: {
            ...brief,
            tasks: merged,
            warnings: Array.from(new Set([...(Array.isArray(brief?.warnings) ? brief.warnings : []), "ai structure recovery applied: local"])),
          },
          applied: true,
          mode: "local",
        };
      }
    }
    if (!shouldTryOpenAi("cleanup")) {
      return { brief, applied: false, reason: "local_failed" };
    }
  }

  const remote = await recoverWithOpenAi(prompt);
  if (!remote) return { brief, applied: false, reason: "openai_failed" };
  const merged = mergeRecoveredTasks(tasks, remote.tasks);
  if (merged === tasks) return { brief, applied: false, reason: "merge_guard" };
  return {
    brief: {
      ...brief,
      tasks: merged,
      warnings: Array.from(new Set([...(Array.isArray(brief?.warnings) ? brief.warnings : []), "ai structure recovery applied: openai"])),
    },
    applied: true,
    mode: remote.mode,
  };
}
