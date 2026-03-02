import { fetchOpenAiJson, resolveOpenAiApiKey } from "@/lib/openai/client";
import { readOpenAiModel } from "@/lib/openai/modelConfig";
import { buildResponsesTemperatureParam } from "@/lib/openai/responsesParams";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";

type RecoverInput = {
  pdfBytes: Buffer;
  fallbackTitle: string;
  sourceText: string;
  currentBrief?: any;
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

function normalizeCelsius(value: string) {
  return String(value || "")
    .replace(/([0-9])\s*(?:\n\s*)?[∘°]\s*(?:\n\s*)?(?:퐶퐶|퐶\s*퐶|C\s*C|C{2,})\b/gi, "$1 °C")
    .replace(/([0-9])\s*(?:\n\s*)?퐶퐶\b/gi, "$1 °C")
    .replace(/([0-9])\s*[∘°]\s*(?:\n\s*)?C\b/gi, "$1 °C");
}

function parseN(raw: any, fallback: number) {
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0 && n < 100) return n;
  return fallback;
}

function sanitizePart(raw: any) {
  const key = String(raw?.key || "").trim().toLowerCase();
  const text = normalizeCelsius(String(raw?.text || "").trim());
  if (!key || !text) return null;
  return { key, text };
}

function normalizeTaskWithImageToken(task: any) {
  const n = Number(task?.n || 0);
  const pages = Array.isArray(task?.pages)
    ? task.pages.map((v: any) => Number(v)).filter((v: number) => Number.isInteger(v) && v > 0)
    : [];
  let text = normalizeCelsius(String(task?.text || ""));
  const parts = Array.isArray(task?.parts) ? task.parts.map(sanitizePart).filter(Boolean) : [];
  const joined = [text, ...parts.map((p: any) => p?.text || "")].join("\n");
  const mentionsFigure = /\b(figure\s*\d+|diagram|schematic|graph\s+below)\b/i.test(joined);
  const hasImg = /\[\[IMG:[^\]]+\]\]/.test(joined);
  if (mentionsFigure && !hasImg && n > 0) {
    const leadPage = pages.length ? pages[pages.length - 1] : 0;
    const token = `[[IMG:p${leadPage || 0}-t${n}-img1]]`;
    const idx = parts.findIndex((p: any) => /\b(figure\s*\d+|diagram|schematic)\b/i.test(String(p?.text || "")));
    if (idx >= 0) {
      parts[idx] = { ...parts[idx], text: `${String(parts[idx]?.text || "").trim()}\n${token}`.trim() };
    } else {
      text = `${text}\n${token}`.trim();
    }
  }

  return {
    n,
    label: `Task ${n}`,
    text: String(text || "").trim(),
    prompt: String(text || "").trim(),
    parts: parts.length ? parts : undefined,
    pages: pages.length ? pages : undefined,
    confidence: "HEURISTIC" as const,
    warnings: ["ai whole-pdf fallback applied"],
    scenarioText: normalizeCelsius(String(task?.scenarioText || "").trim()) || null,
    aiCorrected: true,
  };
}

function sanitizeRecoveredBrief(raw: any, fallbackTitle: string, currentBrief: any) {
  const tasksRaw = Array.isArray(raw?.tasks) ? raw.tasks : [];
  const tasks = tasksRaw
    .map((t: any, idx: number) => {
      const n = parseN(t?.n, idx + 1);
      return normalizeTaskWithImageToken({ ...t, n });
    })
    .filter((t: any) => Number(t?.n) > 0 && String(t?.text || "").trim().length >= 30)
    .sort((a: any, b: any) => Number(a.n) - Number(b.n));

  const scenariosRaw = Array.isArray(raw?.scenarios) ? raw.scenarios : [];
  const scenarios = scenariosRaw
    .map((s: any) => ({
      text: normalizeCelsius(String(s?.text || "").trim()),
      appliesToTask: Number(s?.appliesToTask || 0),
      pages: Array.isArray(s?.pages)
        ? s.pages.map((v: any) => Number(v)).filter((v: number) => Number.isInteger(v) && v > 0)
        : undefined,
    }))
    .filter((s: any) => s.text && Number.isInteger(s.appliesToTask) && s.appliesToTask > 0);

  const header = raw?.header && typeof raw.header === "object"
    ? {
        ...(currentBrief?.header && typeof currentBrief.header === "object" ? currentBrief.header : {}),
        ...raw.header,
      }
    : currentBrief?.header || null;

  const aiAssets = {
    images: Array.isArray(raw?.images) ? raw.images : [],
    tables: Array.isArray(raw?.tables) ? raw.tables : [],
    graphs: Array.isArray(raw?.graphs) ? raw.graphs : [],
    equations: Array.isArray(raw?.equations) ? raw.equations : [],
  };

  return {
    ...currentBrief,
    kind: "BRIEF",
    title: String(raw?.title || currentBrief?.title || fallbackTitle || "").trim() || null,
    header,
    tasks,
    scenarios,
    warnings: Array.from(
      new Set([...(Array.isArray(currentBrief?.warnings) ? currentBrief.warnings : []), "ai whole-pdf fallback applied"])
    ),
    aiAssets,
  };
}

function buildPrompt(input: { fallbackTitle: string; sourceText: string; currentBrief: any }) {
  const currentTasks = Array.isArray(input.currentBrief?.tasks)
    ? input.currentBrief.tasks.map((t: any) => ({
        n: t?.n,
        text: String(t?.text || "").slice(0, 1400),
        parts: Array.isArray(t?.parts) ? t.parts : [],
        scenarioText: String(t?.scenarioText || "").slice(0, 600),
      }))
    : [];

  return [
    "Extract this assignment brief from the uploaded PDF into strict JSON.",
    "Do not add prose outside JSON.",
    'Required schema root keys: {"title","header","scenarios","tasks","images","tables","graphs","equations"}',
    "Task requirements:",
    "- preserve wording from PDF as closely as possible",
    "- include full task body in tasks[n].text",
    "- include nested parts with exact keys when visible (1,2,3,a,b,i,ii,b.i,b.ii,b.ii.a, etc.)",
    "- map scenario/context into scenarios[] with appliesToTask",
    "- include scenarioText inside each task when known",
    "- if a task references a figure/diagram/graph, insert [[IMG:p{page}-t{task}-img1]] in text or part text",
    "Normalization requirements:",
    "- normalize Celsius artifacts to '°C'",
    "- keep equations in plain text; do not invent equation tokens",
    "Asset requirements:",
    "- images[]: [{taskNumber,partKey,page,caption,referenceText}]",
    "- tables[]: [{taskNumber,partKey,page,title,headers,rows}]",
    "- graphs[]: [{taskNumber,partKey,page,chartType,title,data:[{label,value}]}]",
    "- equations[]: [{taskNumber,partKey,page,text,latex?}]",
    "",
    `Fallback title: ${input.fallbackTitle}`,
    "",
    "Current extraction (for repair context):",
    JSON.stringify({ tasks: currentTasks, warnings: input.currentBrief?.warnings || [] }, null, 2),
    "",
    "OCR text (truncated):",
    String(input.sourceText || "").slice(0, 60000),
  ].join("\n");
}

export async function recoverBriefFromWholePdfWithOpenAi(input: RecoverInput): Promise<{
  ok: boolean;
  brief?: any;
  reason?: string;
}> {
  const { apiKey } = resolveOpenAiApiKey("preferStandard");
  const model = String(process.env.OPENAI_BRIEF_WHOLE_PDF_MODEL || readOpenAiModel().model || "").trim();
  if (!apiKey || !model) {
    return { ok: false, reason: "OpenAI model/key not configured." };
  }

  const prompt = buildPrompt({
    fallbackTitle: String(input.fallbackTitle || "").trim(),
    sourceText: String(input.sourceText || ""),
    currentBrief: input.currentBrief || {},
  });

  const pdfDataUrl = `data:application/pdf;base64,${Buffer.from(input.pdfBytes).toString("base64")}`;
  const res = await fetchOpenAiJson(
    "/v1/responses",
    apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        ...buildResponsesTemperatureParam(model, 0),
        max_output_tokens: Number(process.env.OPENAI_BRIEF_WHOLE_PDF_MAX_OUTPUT_TOKENS || 5200),
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_file", filename: "brief.pdf", file_data: pdfDataUrl },
            ],
          },
        ],
      }),
    },
    {
      timeoutMs: Number(process.env.OPENAI_BRIEF_WHOLE_PDF_TIMEOUT_MS || 90000),
      retries: Number(process.env.OPENAI_BRIEF_WHOLE_PDF_RETRIES || 1),
    }
  );
  if (!res.ok) return { ok: false, reason: `OpenAI ${res.status}: ${res.message}` };

  const data: any = res.json;
  recordOpenAiUsage({ model, op: "brief_whole_pdf_recovery", usage: data?.usage });

  const fromOutputText = String(data?.output_text || "").trim();
  const fromOutput = Array.isArray(data?.output)
    ? data.output
        .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
        .map((c: any) => String(c?.text || c?.output_text || ""))
        .filter(Boolean)
        .join("\n")
        .trim()
    : "";
  const parsed = parseJsonObject(fromOutputText || fromOutput || "");
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "OpenAI did not return valid JSON payload." };
  }

  const brief = sanitizeRecoveredBrief(parsed, input.fallbackTitle, input.currentBrief || {});
  if (!Array.isArray(brief?.tasks) || brief.tasks.length === 0) {
    return { ok: false, reason: "Recovered payload has no usable tasks." };
  }
  return { ok: true, brief };
}
