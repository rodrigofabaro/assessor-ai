import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";
import { resolveStoredFile } from "@/lib/extraction/storage/resolveStoredFile";
import { resolveStorageAbsolutePath, toStorageRelativePath, writeStorageFile } from "@/lib/storage/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeToken(value: string) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function pageFromToken(token: string): number {
  const m = String(token || "").match(/\bp(\d+)\b/i);
  const n = Number(m?.[1] || 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function hasReliablePageInToken(token: string): boolean {
  const m = String(token || "").match(/\bp(\d+)\b/i);
  const n = Number(m?.[1] || 0);
  return Number.isFinite(n) && n > 0;
}

function taskFromToken(token: string): number | null {
  const m = String(token || "").match(/\bt(\d+)\b/i);
  const n = Number(m?.[1] || 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseFigureNumber(value: string): number | null {
  const m = String(value || "").match(/\bfigure\s*([1-9]\d?)\b/i);
  const n = Number(m?.[1] || 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeForMatch(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickAnchorWords(value: string) {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "below",
    "shown",
    "figure",
    "part",
    "task",
    "consider",
    "needs",
    "power",
    "will",
    "into",
    "your",
    "have",
    "has",
    "are",
    "was",
    "were",
    "a",
    "an",
    "of",
    "to",
    "in",
    "on",
    "as",
    "by",
  ]);
  return normalizeForMatch(value)
    .split(" ")
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !stop.has(w))
    .slice(0, 10);
}

type FigureHint = {
  anchorText: string;
  figureNumber: number | null;
  taskNumber: number | null;
};

function findFigureHintFromDraft(draft: any, token: string): FigureHint {
  const marker = `[[IMG:${token}]]`;
  const taskNum = taskFromToken(token);
  const tasks = Array.isArray(draft?.tasks) ? draft.tasks : [];

  const scanTokenContext = (text: string) => {
    const src = String(text || "");
    const idx = src.indexOf(marker);
    if (idx < 0) return null;
    const before = src.slice(Math.max(0, idx - 500), idx);
    const after = src.slice(idx + marker.length, idx + marker.length + 240);
    const beforeLines = before
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const anchorLine = beforeLines.length ? beforeLines[beforeLines.length - 1] : "";
    const around = `${before}\n${after}`;
    return {
      anchorLine: anchorLine || normalizeForMatch(around).slice(-180),
      figureNumber: parseFigureNumber(around),
    };
  };

  for (const task of tasks) {
    if (taskNum && Number(task?.n) !== taskNum) continue;
    const candidateTexts = [
      String(task?.text || ""),
      String(task?.prompt || ""),
      String(task?.scenarioText || ""),
      ...(Array.isArray(task?.parts) ? task.parts.map((p: any) => String(p?.text || "")) : []),
    ];
    for (const src of candidateTexts) {
      const hit = scanTokenContext(src);
      if (!hit) continue;
      const figureNumber = hit.figureNumber ?? parseFigureNumber(src);
      let anchorText = hit.anchorLine;
      if (figureNumber) {
        const cap = candidateTexts
          .map((v) => String(v || ""))
          .map((v) => v.match(new RegExp(`\\bFigure\\s*${figureNumber}\\s*[:\\-][^\\n\\r]*`, "i"))?.[0] || "")
          .find(Boolean);
        if (cap) anchorText = cap;
      }
      return { anchorText: String(anchorText || "").trim(), figureNumber, taskNumber: Number(task?.n) || null };
    }
  }

  const figureNumber = parseFigureNumber(token);
  return { anchorText: "", figureNumber, taskNumber: taskNum };
}

type TextLine = {
  y: number;
  minX: number;
  maxX: number;
  text: string;
};

async function extractPageLines(page: any, viewport: any, pdfjs: any): Promise<TextLine[]> {
  const textContent = await page.getTextContent();
  const lineMap = new Map<number, Array<{ x: number; y: number; text: string; width: number }>>();
  const items = Array.isArray(textContent?.items) ? textContent.items : [];
  for (const item of items) {
    const raw = String((item as any)?.str || "");
    if (!raw.trim()) continue;
    const tr = pdfjs.Util.transform(viewport.transform, (item as any).transform);
    const x = Number(tr?.[4] || 0);
    const y = Number(tr?.[5] || 0);
    const w = Math.max(1, Number((item as any)?.width || 0));
    const key = Math.round(y / 6) * 6;
    if (!lineMap.has(key)) lineMap.set(key, []);
    lineMap.get(key)!.push({ x, y, text: raw, width: w });
  }

  const out: TextLine[] = [];
  for (const [key, arr] of lineMap.entries()) {
    if (!arr.length) continue;
    arr.sort((a, b) => a.x - b.x);
    const text = arr.map((v) => v.text).join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const minX = Math.min(...arr.map((v) => v.x));
    const maxX = Math.max(...arr.map((v) => v.x + v.width));
    out.push({ y: key, minX, maxX, text });
  }
  out.sort((a, b) => a.y - b.y);
  return out;
}

function pickCaptionLine(lines: TextLine[], hint: FigureHint, pageHeight: number): { line: TextLine; index: number } | null {
  if (!lines.length) return null;
  const figureNumber = hint.figureNumber || null;
  const figureRegex = figureNumber
    ? new RegExp(`\\bfigure\\s*${figureNumber}\\b`, "i")
    : /\bfigure\s*\d+\b/i;
  const anchorWords = pickAnchorWords(hint.anchorText);

  let bestIdx = -1;
  let bestScore = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const text = String(line.text || "");
    const norm = normalizeForMatch(text);
    if (!norm) continue;
    if (!figureRegex.test(text) && !/^\s*figure\s*\d+\s*[:\-]/i.test(text)) continue;

    let score = 0;
    if (new RegExp(`^\\s*figure\\s*${figureNumber || "\\d+"}\\s*[:\\-]`, "i").test(text)) score += 7;
    if (/^\s*figure\s*\d+\s*[:\-]/i.test(text)) score += 4;
    if (figureRegex.test(text)) score += 3;
    if (/schematic|diagram/i.test(text)) score += 1.5;
    if (/below/i.test(text)) score -= 0.5;
    if (anchorWords.length) {
      const overlap = anchorWords.filter((w) => norm.includes(w)).length;
      score += Math.min(3, overlap * 0.8);
    }
    score += (line.y / Math.max(1, pageHeight)) * 1.5;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) return null;
  return { line: lines[bestIdx], index: bestIdx };
}

function deriveCropRect(lines: TextLine[], captionIndex: number, viewport: { width: number; height: number }) {
  const caption = lines[captionIndex];
  if (!caption) return null;
  const width = Math.max(1, Number(viewport.width || 1));
  const height = Math.max(1, Number(viewport.height || 1));
  const isFigureCaption = /^\s*figure\s*\d+\s*[:\-]/i.test(caption.text || "");
  const longLine = (line: TextLine) => normalizeForMatch(line.text).length >= 28;
  const aboveNarrative = lines.filter(
    (line, idx) => idx !== captionIndex && line.y < caption.y - 18 && line.y >= caption.y - 260 && longLine(line)
  ).length;
  const belowNarrative = lines.filter(
    (line, idx) => idx !== captionIndex && line.y > caption.y + 18 && line.y <= caption.y + 260 && longLine(line)
  ).length;
  const figureLikelyBelowCaption =
    isFigureCaption && caption.y > height * 0.45 && aboveNarrative >= 1 && belowNarrative === 0;

  let top: number;
  let bottom: number;
  if (figureLikelyBelowCaption) {
    top = caption.y - height * 0.06;
    bottom = caption.y + height * 0.4;
  } else if (isFigureCaption) {
    top = caption.y - height * 0.3;
    bottom = caption.y + height * 0.14;
  } else {
    top = caption.y - height * 0.2;
    bottom = caption.y + height * 0.22;
  }
  let left = Math.min(caption.minX, width * 0.14) - width * 0.05;
  let right = Math.max(caption.maxX, width * 0.86) + width * 0.05;

  top = Math.max(0, top);
  bottom = Math.min(height * 0.95, bottom);
  left = Math.max(0, left);
  right = Math.min(width, right);

  if (bottom - top < height * 0.12) {
    top = Math.max(0, caption.y - height * 0.22);
    bottom = Math.min(height, caption.y + height * 0.08);
  }
  if (right - left < width * 0.45) {
    left = width * 0.1;
    right = width * 0.9;
  }
  if (bottom <= top || right <= left) return null;

  return {
    left: Math.floor(left),
    top: Math.floor(top),
    width: Math.max(1, Math.floor(right - left)),
    height: Math.max(1, Math.floor(bottom - top)),
  };
}

async function renderPdfPageToPng(pdfPathAbs: string, pageNumber: number, hint: FigureHint): Promise<Buffer | null> {
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

    const lines = await extractPageLines(page, viewport, pdfjs);
    const caption = pickCaptionLine(lines, hint, height);
    let crop = caption ? deriveCropRect(lines, caption.index, { width, height }) : null;

    // Fallback crop when caption line is missing: use lower page band where figures usually appear.
    if (!crop) {
      crop = {
        left: Math.floor(width * 0.08),
        top: Math.floor(height * 0.42),
        width: Math.floor(width * 0.84),
        height: Math.floor(height * 0.5),
      };
    }

    if (!crop || crop.width <= 0 || crop.height <= 0) {
      return canvas.toBuffer("image/png") as Buffer;
    }

    const cropCanvas = createCanvas(crop.width, crop.height);
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(
      canvas as any,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );
    return cropCanvas.toBuffer("image/png") as Buffer;
  } catch {
    return null;
  }
}

async function findBestFigurePage(pdfPathAbs: string, hint: FigureHint): Promise<number | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
    if (pdfjs?.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();
    }
    const bytes = await fs.readFile(pdfPathAbs);
    const data = new Uint8Array(bytes);
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    let bestPage: number | null = null;
    let bestScore = -1;

    for (let pageNumber = 1; pageNumber <= Number(doc.numPages || 1); pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.25 });
      const lines = await extractPageLines(page, viewport, pdfjs);
      const caption = pickCaptionLine(lines, hint, Number(viewport.height || 1));
      if (!caption) continue;
      let score = 1;
      if (hint.figureNumber && new RegExp(`\\bfigure\\s*${hint.figureNumber}\\b`, "i").test(caption.line.text || "")) score += 4;
      if (/^\s*figure\s*\d+\s*[:\-]/i.test(caption.line.text || "")) score += 2;
      if (score > bestScore) {
        bestScore = score;
        bestPage = pageNumber;
      }
    }

    return bestPage;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") || "").trim();
  if (!documentId || !token) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_OR_TOKEN" }, { status: 400 });
  }
  const organizationId = await getRequestOrganizationId();

  const doc = await prisma.referenceDocument.findFirst({
    where: addOrganizationReadScope({ id: documentId }, organizationId) as any,
    select: { id: true, storagePath: true, storedFilename: true, extractedJson: true },
  });
  if (!doc) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const resolved = await resolveStoredFile({ storagePath: doc.storagePath, storedFilename: doc.storedFilename });
  if (!resolved.ok || !resolved.path) {
    return NextResponse.json({ error: "FILE_NOT_FOUND", tried: resolved.tried }, { status: 400 });
  }

  const safeToken = sanitizeToken(token);
  const outRel = toStorageRelativePath("storage", "reference_images", `${documentId}-${safeToken}-v6.png`);
  const outPath = resolveStorageAbsolutePath(outRel) || path.join(process.cwd(), outRel);

  try {
    const cached = await fs.readFile(outPath);
    return new NextResponse(cached as any, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    // cache miss
  }

  const hint = findFigureHintFromDraft(doc.extractedJson, token);
  const page =
    hasReliablePageInToken(token)
      ? pageFromToken(token)
      : (await findBestFigurePage(resolved.path, hint)) || pageFromToken(token);
  const png = await renderPdfPageToPng(resolved.path, page, hint);
  if (!png) return NextResponse.json({ error: "PAGE_RENDER_FAILED" }, { status: 500 });

  await writeStorageFile(outRel, png);

  return new NextResponse(png as any, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=604800, immutable",
    },
  });
}
