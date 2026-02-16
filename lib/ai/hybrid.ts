type ProviderMode = "openai" | "local" | "hybrid";
type AiOp = "cleanup" | "ocr" | "equation";

function normalizeMode(value: string | undefined): ProviderMode {
  const v = String(value || "").trim().toLowerCase();
  if (v === "openai" || v === "local" || v === "hybrid") return v;
  return "hybrid";
}

function opMode(op: AiOp): ProviderMode {
  const opKey =
    op === "cleanup"
      ? process.env.AI_PROVIDER_CLEANUP_MODE
      : op === "ocr"
        ? process.env.AI_PROVIDER_OCR_MODE
        : process.env.AI_PROVIDER_EQUATION_MODE;
  return normalizeMode(opKey || process.env.AI_PROVIDER_MODE);
}

function toBase64FromDataUrl(imageDataUrl: string) {
  const raw = String(imageDataUrl || "");
  const idx = raw.indexOf("base64,");
  return idx >= 0 ? raw.slice(idx + "base64,".length).trim() : raw.trim();
}

export function shouldTryLocal(op: AiOp) {
  const mode = opMode(op);
  if (mode === "openai") return false;
  return !!String(process.env.AI_LOCAL_ENABLED || "true").trim().match(/^(1|true|yes)$/i);
}

export function shouldTryOpenAi(op: AiOp) {
  const mode = opMode(op);
  return mode === "openai" || mode === "hybrid";
}

function localBaseUrl() {
  return String(process.env.AI_LOCAL_BASE_URL || "http://127.0.0.1:11434").trim().replace(/\/+$/, "");
}

function localModelFor(op: AiOp) {
  if (op === "cleanup") {
    return String(process.env.AI_LOCAL_CLEANUP_MODEL || process.env.AI_LOCAL_TEXT_MODEL || "qwen2.5:7b-instruct").trim();
  }
  if (op === "ocr") {
    return String(process.env.AI_LOCAL_OCR_MODEL || process.env.AI_LOCAL_VISION_MODEL || "llava:7b").trim();
  }
  return String(process.env.AI_LOCAL_EQUATION_MODEL || process.env.AI_LOCAL_VISION_MODEL || "llava:7b").trim();
}

async function localFetchJson(url: string, body: unknown, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
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
    if (!res.ok) {
      const message = String(json?.error || json?.message || `Local AI error (${res.status})`);
      return { ok: false as const, status: res.status, message, json };
    }
    return { ok: true as const, status: res.status, json };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return {
      ok: false as const,
      status: aborted ? 408 : 0,
      message: aborted ? "Local AI request timed out." : String(e?.message || "Local AI request failed."),
      json: {},
    };
  } finally {
    clearTimeout(timer);
  }
}

function parsePotentialJson(text: string) {
  const clean = String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  if (!clean) return null;
  try {
    return JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}$/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export async function localJsonText(op: AiOp, prompt: string, opts?: { timeoutMs?: number }) {
  const timeoutMs = Math.max(2000, Number(opts?.timeoutMs || process.env.AI_LOCAL_TIMEOUT_MS || 25000));
  const model = localModelFor(op);
  if (!model) return { ok: false as const, status: 0, message: "Local AI model is not configured." };
  const res = await localFetchJson(
    `${localBaseUrl()}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0 },
    },
    timeoutMs
  );
  if (!res.ok) return res;
  const output = String((res.json as any)?.response || "").trim();
  if (!output) return { ok: false as const, status: 422, message: "Local AI returned empty output." };
  return { ok: true as const, status: res.status, text: output, parsed: parsePotentialJson(output) };
}

export async function localVisionJson(op: AiOp, prompt: string, imageDataUrl: string, opts?: { timeoutMs?: number }) {
  const timeoutMs = Math.max(3000, Number(opts?.timeoutMs || process.env.AI_LOCAL_TIMEOUT_MS || 35000));
  const model = localModelFor(op);
  if (!model) return { ok: false as const, status: 0, message: "Local vision model is not configured." };
  const base64 = toBase64FromDataUrl(imageDataUrl);
  if (!base64) return { ok: false as const, status: 400, message: "Missing image payload." };

  const res = await localFetchJson(
    `${localBaseUrl()}/api/chat`,
    {
      model,
      stream: false,
      format: "json",
      messages: [
        {
          role: "user",
          content: prompt,
          images: [base64],
        },
      ],
      options: { temperature: 0 },
    },
    timeoutMs
  );
  if (!res.ok) return res;
  const text = String((res.json as any)?.message?.content || "").trim();
  if (!text) return { ok: false as const, status: 422, message: "Local vision returned empty output." };
  return { ok: true as const, status: res.status, text, parsed: parsePotentialJson(text) };
}
