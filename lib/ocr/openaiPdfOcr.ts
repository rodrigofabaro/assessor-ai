import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";
import { fetchOpenAiJson, resolveOpenAiApiKey } from "@/lib/openai/client";
import { localVisionJson, shouldTryLocal, shouldTryOpenAi } from "@/lib/ai/hybrid";

type OcrPage = {
  pageNumber: number;
  text: string;
  confidence: number;
  width?: number | null;
  height?: number | null;
};

export type OpenAiPdfOcrResult = {
  ok: boolean;
  pages: OcrPage[];
  combinedText: string;
  warnings: string[];
  model?: string;
  requestId?: string;
};

function getModel() {
  return String(process.env.OPENAI_OCR_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
}

function maxPages() {
  const n = Number(process.env.OCR_MAX_PAGES || 4);
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(12, Math.floor(n)));
}

function minCharsPerPage() {
  const n = Number(process.env.OCR_MIN_CHARS_PER_PAGE || 40);
  if (!Number.isFinite(n)) return 40;
  return Math.max(10, Math.min(500, Math.floor(n)));
}

function normalizeText(s: string) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractOutputText(responseJson: any): string {
  const direct = String(responseJson?.output_text || "").trim();
  if (direct) return direct;
  const out = Array.isArray(responseJson?.output) ? responseJson.output : [];
  const parts: string[] = [];
  for (const block of out) {
    const content = Array.isArray(block?.content) ? block.content : [];
    for (const c of content) {
      const txt = String(c?.text || c?.output_text || "").trim();
      if (txt) parts.push(txt);
    }
  }
  return parts.join("\n").trim();
}

async function renderPdfPageToPng(pdfPathAbs: string, pageNumber: number) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const nodeRequire = eval("require") as NodeRequire;
  const canvasModule = nodeRequire("@napi-rs/canvas") as { createCanvas: (w: number, h: number) => any };
  const createCanvas = canvasModule.createCanvas;
  const workerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
  if (pdfjs?.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();
  }

  const data = new Uint8Array(await fs.readFile(pdfPathAbs));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2.0 });
  const width = Math.max(1, Math.floor(viewport.width));
  const height = Math.max(1, Math.floor(viewport.height));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx as any, viewport }).promise;
  const png = canvas.toBuffer("image/png");
  return { png, width, height, pageCount: doc.numPages as number };
}

async function ocrOnePageWithOpenAi(args: {
  apiKey: string;
  model: string;
  requestId: string;
  pageNumber: number;
  pngBase64: string;
}) {
  const response = await fetchOpenAiJson(
    "/v1/responses",
    args.apiKey,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
      model: args.model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extract all readable text from this assignment page. Return plain text only. Keep line breaks where meaningful. Do not summarize.",
            },
            {
              type: "input_image",
              image_url: `data:image/png;base64,${args.pngBase64}`,
            },
          ],
        },
      ],
      max_output_tokens: Number(process.env.OPENAI_OCR_MAX_OUTPUT_TOKENS || 1200),
    }),
    },
    {
      timeoutMs: Number(process.env.OPENAI_OCR_TIMEOUT_MS || 45000),
      retries: Number(process.env.OPENAI_OCR_RETRIES || 2),
    }
  );

  if (!response.ok) throw new Error(response.message);
  const json = response.json;

  const usage = json?.usage || null;
  if (usage) {
    recordOpenAiUsage({
      model: args.model,
      op: "submission_ocr_page",
      usage,
    });
  }

  return normalizeText(extractOutputText(json));
}

async function ocrOnePageWithLocal(args: {
  pageNumber: number;
  pngBase64: string;
}) {
  const prompt = [
    "Extract all readable text from this assignment page.",
    'Return strict JSON: {"text":"..."}',
    "Keep meaningful line breaks. Do not summarize.",
  ].join("\n");
  const local = await localVisionJson("ocr", prompt, `data:image/png;base64,${args.pngBase64}`, {
    timeoutMs: Number(process.env.AI_LOCAL_OCR_TIMEOUT_MS || process.env.AI_LOCAL_TIMEOUT_MS || 30000),
  });
  if (!local.ok) throw new Error(local.message || "Local OCR failed");
  const localParsed = "parsed" in local ? local.parsed : null;
  const localText = "text" in local ? local.text : "";
  const text =
    String((localParsed as any)?.text || "").trim() ||
    String((localText || "")).trim();
  return normalizeText(text);
}

export async function ocrPdfWithOpenAi(input: {
  pdfPath: string;
  requestId: string;
}): Promise<OpenAiPdfOcrResult> {
  const warnings: string[] = [];
  const { apiKey } = resolveOpenAiApiKey("preferStandard");
  const model = getModel();
  if (!apiKey && !shouldTryLocal("ocr")) {
    return {
      ok: false,
      pages: [],
      combinedText: "",
      warnings: ["OCR skipped: OPENAI_API_KEY not configured."],
      model,
      requestId: input.requestId,
    };
  }

  try {
    const pdfPathAbs = path.isAbsolute(input.pdfPath) ? input.pdfPath : path.join(process.cwd(), input.pdfPath);
    const first = await renderPdfPageToPng(pdfPathAbs, 1);
    const pageCount = Math.max(1, Number(first.pageCount || 1));
    const targetPages = Math.min(pageCount, maxPages());
    const minChars = minCharsPerPage();

    const pages: OcrPage[] = [];

    for (let p = 1; p <= targetPages; p += 1) {
      const rendered = p === 1 ? first : await renderPdfPageToPng(pdfPathAbs, p);
      const pngBase64 = rendered.png.toString("base64");
      let text = "";
      let localErr = "";
      if (shouldTryLocal("ocr")) {
        try {
          text = await ocrOnePageWithLocal({ pageNumber: p, pngBase64 });
        } catch (e: any) {
          localErr = String(e?.message || "Local OCR failed.");
        }
      }
      if (!text && shouldTryOpenAi("ocr") && apiKey) {
        text = await ocrOnePageWithOpenAi({
          apiKey,
          model,
          requestId: input.requestId,
          pageNumber: p,
          pngBase64,
        });
      }
      if (!text && localErr) warnings.push(`Local OCR fallback used: ${localErr}`);
      pages.push({
        pageNumber: p,
        text,
        confidence: text.length >= minChars ? 0.85 : 0.55,
        width: rendered.width,
        height: rendered.height,
      });
    }

    const combinedText = normalizeText(pages.map((p) => p.text).filter(Boolean).join("\n\n"));
    if (!combinedText) warnings.push("OCR completed but returned no text.");
    if (targetPages < pageCount) warnings.push(`OCR limited to first ${targetPages}/${pageCount} pages.`);

    return {
      ok: combinedText.length > 0,
      pages,
      combinedText,
      warnings,
      model,
      requestId: input.requestId,
    };
  } catch (e: any) {
    warnings.push(String(e?.message || e));
    return {
      ok: false,
      pages: [],
      combinedText: "",
      warnings,
      model,
      requestId: input.requestId,
    };
  }
}
