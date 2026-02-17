import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveStoredFile } from "@/lib/extraction/storage/resolveStoredFile";
import { localVisionJson, shouldTryLocal, shouldTryOpenAi } from "@/lib/ai/hybrid";
import { fetchOpenAiJson, resolveOpenAiApiKey } from "@/lib/openai/client";
import { readOpenAiModel } from "@/lib/openai/modelConfig";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GraphPoint = { label: string; value: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function sanitizeGraphPayload(raw: any): { chartTypes: string[]; points: GraphPoint[]; confidence: number } {
  const chartTypes = Array.isArray(raw?.chartTypes)
    ? raw.chartTypes.map((v: any) => String(v || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const points = Array.isArray(raw?.points)
    ? raw.points
        .map((p: any) => ({ label: String(p?.label || "").trim(), value: Number(p?.value) }))
        .filter((p: any) => p.label && Number.isFinite(p.value))
    : [];

  const dedup = new Set<string>();
  const finalPoints: GraphPoint[] = [];
  for (const p of points) {
    const key = `${p.label.toLowerCase()}::${p.value}`;
    if (dedup.has(key)) continue;
    dedup.add(key);
    finalPoints.push({ label: p.label, value: p.value });
  }

  return {
    chartTypes,
    points: finalPoints.slice(0, 30),
    confidence: clamp(Number(raw?.confidence || 0), 0, 1),
  };
}

function deriveRecoveredConfidence(input: {
  provider: "local" | "openai";
  pointsCount: number;
  chartTypeCount: number;
  modelConfidence: number;
}) {
  const { provider, pointsCount, chartTypeCount, modelConfidence } = input;
  let score = provider === "local" ? 0.72 : 0.66;
  if (pointsCount >= 2) score += 0.08;
  if (pointsCount >= 3) score += 0.07;
  if (pointsCount >= 5) score += 0.05;
  if (chartTypeCount > 0) score += 0.03;
  score += clamp(modelConfidence, 0, 1) * 0.1;
  return clamp(score, 0.55, 0.99);
}

function extractResponseText(data: any) {
  const direct = String(data?.output_text || "").trim();
  if (direct) return direct;
  const out = Array.isArray(data?.output) ? data.output : [];
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

async function renderPdfPageToPngDataUrl(
  pdfPathAbs: string,
  pageNumber: number
): Promise<{ dataUrl: string; pageCount: number } | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
    if (pdfjs?.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();
    }
    const nodeRequire = eval("require") as NodeRequire;
    const canvasModule = nodeRequire("@napi-rs/canvas") as { createCanvas: (w: number, h: number) => any };
    const createCanvas = canvasModule.createCanvas;

    const bytes = await fs.readFile(pdfPathAbs);
    const data = new Uint8Array(bytes);
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    const clampedPage = Math.max(1, Math.min(Number(doc.numPages || 1), Number(pageNumber || 1)));
    const page = await doc.getPage(clampedPage);
    const viewport = page.getViewport({ scale: 2.0 });
    const width = Math.max(1, Math.floor(viewport.width));
    const height = Math.max(1, Math.floor(viewport.height));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx as any, viewport }).promise;
    const png = canvas.toBuffer("image/png");
    return {
      dataUrl: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
      pageCount: Number(doc.numPages || 1),
    };
  } catch {
    return null;
  }
}

async function recoverGraphFromImage(input: { imageDataUrl: string; anchorText: string }) {
  const prompt = [
    "Extract chart/graph data from this assignment page and return strict JSON only.",
    'Schema: {"chartTypes":["bar|pie|line"],"points":[{"label":"string","value":number}],"confidence":0..1}',
    "Use values exactly as visible. Do not invent numbers.",
    "If data cannot be read, return points as [] and low confidence.",
    input.anchorText ? `Anchor text near target graph: "${input.anchorText.slice(0, 280)}"` : "Use the visible chart near the task instructions.",
  ].join("\n");

  if (shouldTryLocal("graph")) {
    const local = await localVisionJson("graph", prompt, input.imageDataUrl, {
      timeoutMs: Number(process.env.AI_LOCAL_GRAPH_TIMEOUT_MS || process.env.AI_LOCAL_TIMEOUT_MS || 30000),
    });
    if (local.ok) {
      const parsed = sanitizeGraphPayload("parsed" in local ? local.parsed : {});
      if (parsed.points.length >= 2) {
        return {
          ...parsed,
          confidence: deriveRecoveredConfidence({
            provider: "local",
            pointsCount: parsed.points.length,
            chartTypeCount: parsed.chartTypes.length,
            modelConfidence: parsed.confidence,
          }),
          provider: "local" as const,
        };
      }
    }
    if (!shouldTryOpenAi("graph")) return { chartTypes: [], points: [], confidence: 0, provider: "local" as const };
  }

  const { apiKey } = resolveOpenAiApiKey("preferStandard");
  const model = String(process.env.OPENAI_GRAPH_MODEL || readOpenAiModel().model || "").trim();
  if (!apiKey || !model) return { chartTypes: [], points: [], confidence: 0, provider: "openai" as const };

  const res = await fetchOpenAiJson(
    "/v1/responses",
    apiKey,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_output_tokens: Number(process.env.OPENAI_GRAPH_MAX_OUTPUT_TOKENS || 420),
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: input.imageDataUrl },
            ],
          },
        ],
      }),
    },
    {
      timeoutMs: Number(process.env.OPENAI_GRAPH_TIMEOUT_MS || 30000),
      retries: Number(process.env.OPENAI_GRAPH_RETRIES || 1),
    }
  );
  if (!res.ok) return { chartTypes: [], points: [], confidence: 0, provider: "openai" as const };

  const data = res.json;
  recordOpenAiUsage({ model, op: "graph_from_reference_page", usage: data?.usage });
  const text = extractResponseText(data);
  const deFenced = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const jsonLike = deFenced.match(/\{[\s\S]*\}/)?.[0] || "";
  if (!jsonLike) return { chartTypes: [], points: [], confidence: 0, provider: "openai" as const };
  const parsed = sanitizeGraphPayload(JSON.parse(jsonLike));
  return {
    ...parsed,
    confidence: deriveRecoveredConfidence({
      provider: "openai",
      pointsCount: parsed.points.length,
      chartTypeCount: parsed.chartTypes.length,
      modelConfidence: parsed.confidence,
    }),
    provider: "openai" as const,
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  if (!documentId) return NextResponse.json({ error: "MISSING_DOCUMENT_ID" }, { status: 400 });

  const body = await req.json().catch(() => ({} as any));
  const requestedPage = Math.max(1, Number(body?.pageNumber || 1));
  const anchorText = String(body?.anchorText || "").trim();

  const doc = await prisma.referenceDocument.findUnique({
    where: { id: documentId },
    select: { id: true, type: true, storagePath: true, storedFilename: true },
  });
  if (!doc) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const resolved = await resolveStoredFile({ storagePath: doc.storagePath, storedFilename: doc.storedFilename });
  if (!resolved.ok || !resolved.path) {
    return NextResponse.json({ error: "FILE_NOT_FOUND", tried: resolved.tried }, { status: 400 });
  }

  const firstRender = await renderPdfPageToPngDataUrl(resolved.path, requestedPage);
  if (!firstRender) return NextResponse.json({ error: "PAGE_RENDER_FAILED" }, { status: 500 });

  try {
    const pageCandidates = Array.from(
      new Set(
        [requestedPage, requestedPage + 1, requestedPage - 1]
          .map((p) => clamp(Math.floor(p), 1, Math.max(1, firstRender.pageCount)))
      )
    );

    let recovered: Awaited<ReturnType<typeof recoverGraphFromImage>> | null = null;
    for (const p of pageCandidates) {
      const rendered = p === requestedPage ? firstRender : await renderPdfPageToPngDataUrl(resolved.path, p);
      if (!rendered?.dataUrl) continue;
      const current = await recoverGraphFromImage({ imageDataUrl: rendered.dataUrl, anchorText });
      if (!current.points.length) continue;
      if (
        !recovered ||
        current.confidence > recovered.confidence ||
        (current.confidence === recovered.confidence && current.points.length > recovered.points.length)
      ) {
        recovered = current;
      }
    }

    if (!recovered || !recovered.points.length) {
      return NextResponse.json(
        { ok: false, points: [], confidence: 0, provider: "none", message: "No graph data extracted." },
        { status: 422 }
      );
    }
    return NextResponse.json({
      ok: true,
      points: recovered.points,
      chartTypes: recovered.chartTypes,
      confidence: clamp(recovered.confidence || 0.72, 0.55, 0.99),
      provider: recovered.provider,
      pagesTried: pageCandidates,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "CHART_RECOVER_FAILED", message: String(e?.message || e) }, { status: 500 });
  }
}
