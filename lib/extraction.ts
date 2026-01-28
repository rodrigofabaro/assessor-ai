import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { pathToFileURL } from "url";
import type { PDFPageProxy } from "pdfjs-dist";

export type ExtractedToken = {
  text: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

export type ExtractedPageResult = {
  pageNumber: number;
  text: string;
  confidence: number;
  width?: number | null;
  height?: number | null;
  tokens?: ExtractedToken[] | null;
};

export type ExtractFileResult = {
  kind: "PDF" | "DOCX" | "UNKNOWN";
  detectedMime?: string | null;
  isScanned: boolean;
  overallConfidence: number;
  pages: ExtractedPageResult[];
  warnings?: string[];
};

// Tunables
const PDF_PAGE_TIMEOUT_MS = 15000;
const MIN_CHARS_PER_PAGE = 20;
const MIN_TOTAL_TEXT = 50;
const MAX_PAGES_GUARD = 500;
const SUBPROCESS_TEXT_MIN = 100;

// Performance knobs (safe defaults)
const PDF_PAGE_CONCURRENCY = 6;
const LINE_Y_TOL = 4; // tolerance bucket for "same line" grouping
const SPACE_X_GAP = 3;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function runWithLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }

  const n = Math.max(1, Math.min(limit, tasks.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * Convert PDF.js text items into readable, line-broken text.
 * Strategy:
 *  - Pre-normalize items into {text,x,y,w,hasEOL}
 *  - Sort once by y DESC, x ASC
 *  - Bucket into lines by y tolerance (LINE_Y_TOL)
 *  - Within a line, insert spaces based on x gap heuristics
 */
function itemsToText(items: any): string {
  try {
    const safeItems: any[] = Array.isArray(items) ? items : [];
    if (!safeItems.length) return "";

    type NormItem = { text: string; x: number; y: number; w: number; hasEOL: boolean };

    const norm: NormItem[] = [];
    for (const it of safeItems) {
      let raw = "";

      if (typeof it?.str === "string") raw = it.str;
      else if (Array.isArray(it?.chars)) {
        raw = it.chars.map((c: any) => (typeof c?.str === "string" ? c.str : "")).join("");
      }

      const hasEOL = !!it?.hasEOL;

      const cleaned = String(raw || "").replace(/\s+/g, " ").trim();
      if (!cleaned) {
        // Even if no text, an explicit EOL can end a line.
        if (hasEOL) norm.push({ text: "", x: 0, y: Number.NaN, w: 0, hasEOL: true });
        continue;
      }

      const tr = Array.isArray(it?.transform) ? it.transform : null;
      const x = tr && Number.isFinite(tr[4]) ? Number(tr[4]) : 0;
      const y = tr && Number.isFinite(tr[5]) ? Number(tr[5]) : 0;
      const w = Number.isFinite(it?.width) ? Number(it.width) : 0;

      norm.push({ text: cleaned, x, y, w, hasEOL });
    }

    // Sort once: top-to-bottom (y desc), left-to-right (x asc)
    norm.sort((a, b) => {
      const ay = Number.isFinite(a.y) ? a.y : -Infinity;
      const by = Number.isFinite(b.y) ? b.y : -Infinity;
      if (ay !== by) return by - ay;
      return a.x - b.x;
    });

    const lines: string[] = [];
    let curY: number | null = null;
    let cur = "";
    let lastX: number | null = null;

    const flush = () => {
      const s = cur.replace(/\s+/g, " ").trimEnd();
      if (s) lines.push(s);
      cur = "";
      curY = null;
      lastX = null;
    };

    for (const it of norm) {
      // Explicit EOL marker
      if (it.hasEOL && !it.text) {
        flush();
        continue;
      }

      // Start line
      if (curY === null) {
        curY = it.y;
      } else if (Number.isFinite(it.y) && Number.isFinite(curY) && Math.abs(it.y - curY) > LINE_Y_TOL) {
        flush();
        curY = it.y;
      }

      // Space heuristic within line
      if (cur.length > 0 && lastX !== null) {
        const xGap = it.x - lastX;
        const prevChar = cur.slice(-1);
        const nextChar = it.text[0];

        const needsSpace =
          xGap > SPACE_X_GAP &&
          !/[\s([{"'/-]$/.test(prevChar) &&
          !/[,.;:!?)}\]"']/.test(nextChar);

        if (needsSpace && !cur.endsWith(" ")) cur += " ";
      }

      cur += it.text;
      lastX = it.x + (it.w || 0);

      if (it.hasEOL) flush();
    }

    flush();

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    // LAST LINE OF DEFENCE: never throw from text reconstruction
    return "";
  }
}

function computeIsScannedFromPages(pages: ExtractedPageResult[]): boolean {
  const combined = pages.map((p) => p.text || "").join("\n").trim();
  return combined.length < MIN_TOTAL_TEXT;
}

function parseJsonFromNoisyStdout(stdout: string): any {
  const lastOpen = stdout.lastIndexOf("{");
  const lastClose = stdout.lastIndexOf("}");
  if (lastOpen === -1 || lastClose === -1 || lastClose <= lastOpen) {
    throw new Error(`No JSON object found in stdout.\nSTDOUT:\n${stdout}`);
  }
  return JSON.parse(stdout.slice(lastOpen, lastClose + 1));
}

function runPdfParseInSubprocess(absPath: string): Promise<{ text: string; numpages: number | null }> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(process.cwd(), "scripts", "pdf-parse-extract.mjs");

    if (!fs.existsSync(scriptPath)) return reject(new Error(`Missing script: ${scriptPath}`));
    if (!fs.existsSync(absPath)) return reject(new Error(`Missing PDF: ${absPath}`));

    const child = spawn(process.execPath, [scriptPath, absPath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
      windowsHide: true,
      env: { ...process.env },
    });

    let out = "";
    let err = "";

    child.stdout.on("data", (d) => (out += d.toString("utf8")));
    child.stderr.on("data", (d) => (err += d.toString("utf8")));

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`pdf-parse subprocess failed (code=${code}): ${err || out}`));
      }

      try {
        const json = parseJsonFromNoisyStdout(out);
        resolve({
          text: String(json.text || ""),
          numpages: json.numpages ?? null,
        });
      } catch (e: any) {
        reject(
          new Error(
            `Failed to parse pdf-parse subprocess output: ${String(e?.message || e)}\nSTDOUT:\n${out}\nSTDERR:\n${err}`
          )
        );
      }
    });
  });
}

async function extractPdf(absPath: string): Promise<ExtractFileResult> {
  const warnings: string[] = [];

  // Async read: avoids blocking the Node event loop during extraction.
  const buf = await fsp.readFile(absPath);
  const data = new Uint8Array(buf);

  // --- PDF.js (per-page) ---
  let pdfjs: any = null;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // IMPORTANT: pdfjs needs a workerSrc, even in Node (it uses a "fake worker").
    const workerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
    if (pdfjs?.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();
    }
  } catch (e: any) {
    warnings.push(`pdfjs load failed: ${String(e?.message || e)}`);
    pdfjs = null;
  }

  let doc: any = null;

  if (pdfjs) {
    // Rich config first, then minimal config fallback.
    try {
      const cmapsDir = path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps") + path.sep;
      const stdFontsDir = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") + path.sep;

      const loadingTask = pdfjs.getDocument({
        data,
        disableWorker: true,
        useSystemFonts: true,
        cMapUrl: pathToFileURL(cmapsDir).toString(),
        cMapPacked: true,
        standardFontDataUrl: pathToFileURL(stdFontsDir).toString(),
      });

      doc = await withTimeout(loadingTask.promise, PDF_PAGE_TIMEOUT_MS, "pdf.getDocument() (rich)");
    } catch (e: any) {
      warnings.push(`pdfjs open failed (rich): ${String(e?.message || e)}`);

      try {
        const loadingTask2 = pdfjs.getDocument({
          data,
          disableWorker: true,
          useSystemFonts: true,
        });

        doc = await withTimeout(loadingTask2.promise, PDF_PAGE_TIMEOUT_MS, "pdf.getDocument() (minimal)");
        warnings.push("pdfjs: opened with minimal config");
      } catch (e2: any) {
        warnings.push(`pdfjs open failed (minimal): ${String(e2?.message || e2)}`);
        doc = null;
      }
    }
  }

  const numPages = Number(doc?.numPages ?? 0);

  if (doc && numPages > MAX_PAGES_GUARD) {
    warnings.push(`PDF too large (${numPages} pages). Guard=${MAX_PAGES_GUARD}`);
    doc = null;
  }

  // If PDF.js opened the doc: return per-page structure (concurrency-limited)
  if (doc && numPages && Number.isFinite(numPages)) {
    const pageCount = Math.max(1, numPages);
    const tasks: Array<() => Promise<ExtractedPageResult>> = Array.from({ length: pageCount }, (_, idx) => {
      const i = idx + 1;
      return async () => {
        try {
          const page = (await withTimeout(doc.getPage(i), PDF_PAGE_TIMEOUT_MS, `pdf.getPage(${i})`)) as PDFPageProxy;
          const viewport = page.getViewport({ scale: 1.0 });

          let tc: any;
          try {
            tc = await withTimeout(
              page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false } as any),
              PDF_PAGE_TIMEOUT_MS,
              `pdf.getTextContent(${i})`
            );
          } catch {
            tc = await withTimeout(page.getTextContent(), PDF_PAGE_TIMEOUT_MS, `pdf.getTextContent(${i})`);
          }

          const text = itemsToText(Array.isArray(tc?.items) ? tc.items : []);

          return {
            pageNumber: i,
            text,
            confidence: text ? 0.9 : 0,
            width: Number.isFinite(viewport?.width) ? Math.round(viewport.width) : null,
            height: Number.isFinite(viewport?.height) ? Math.round(viewport.height) : null,
            tokens: null,
          };
        } catch (e: any) {
          warnings.push(`Page ${i} extraction failed: ${String(e?.message || e)}`);
          return { pageNumber: i, text: "", confidence: 0, width: null, height: null, tokens: null };
        }
      };
    });

    const pages = await runWithLimit(tasks, PDF_PAGE_CONCURRENCY);
    const pagesWithText = pages.reduce((n, p) => n + (p.text.length >= MIN_CHARS_PER_PAGE ? 1 : 0), 0);

    const isScanned = computeIsScannedFromPages(pages);
    const fraction = pages.length ? pagesWithText / pages.length : 0;
    const overallConfidence = isScanned ? 0 : Math.max(0.6, Math.min(0.95, fraction * 0.95));

    warnings.push(`pdfjs: pages=${pages.length}, pagesWithText=${pagesWithText}`);
    if (isScanned) warnings.push("PDF looks scanned/image-only: OCR will be required.");

    return {
      kind: "PDF",
      detectedMime: "application/pdf",
      isScanned,
      overallConfidence,
      pages,
      warnings: warnings.length ? warnings : undefined,
    };
  }

  // --- Fallback: pdf-parse subprocess ---
  try {
    const parsed = await withTimeout(runPdfParseInSubprocess(absPath), PDF_PAGE_TIMEOUT_MS, "pdf-parse subprocess");
    const text = (parsed.text ?? "").trim();

    warnings.push(`pdf-parse: len=${text.length}, numpages=${parsed.numpages ?? "?"}`);

    if (text.length >= SUBPROCESS_TEXT_MIN) {
      // Our subprocess script appends a form-feed () delimiter per page.
      const parts = text
        .split("")
        .map((t) => t.trim())
        .filter(Boolean);

      const pageCount = Math.max(1, parts.length || Number(parsed.numpages ?? 1));
      const pages: ExtractedPageResult[] = [];

      for (let i = 1; i <= pageCount; i++) {
        const pageText = parts.length ? parts[i - 1] ?? "" : i === 1 ? text : "";
        pages.push({
          pageNumber: i,
          text: pageText,
          confidence: pageText ? 0.75 : 0,
          width: null,
          height: null,
          tokens: null,
        });
      }

      const isScanned = computeIsScannedFromPages(pages);

      return {
        kind: "PDF",
        detectedMime: "application/pdf",
        isScanned,
        overallConfidence: isScanned ? 0 : 0.75,
        pages,
        warnings: warnings.length ? warnings : undefined,
      };
    }
  } catch (e: any) {
    warnings.push(`pdf-parse subprocess failed: ${String(e?.message || e)}`);
  }

  return {
    kind: "PDF",
    detectedMime: "application/pdf",
    isScanned: true,
    overallConfidence: 0,
    pages: [{ pageNumber: 1, text: "", confidence: 0, width: null, height: null, tokens: null }],
    warnings: warnings.length ? warnings : undefined,
  };
}

async function extractDocx(absPath: string): Promise<ExtractFileResult> {
  let mammoth: any;
  try {
    mammoth = await import("mammoth");
  } catch (e: any) {
    return {
      kind: "DOCX",
      detectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      isScanned: false,
      overallConfidence: 0,
      pages: [{ pageNumber: 1, text: "", confidence: 0, width: null, height: null, tokens: null }],
      warnings: [`DOCX engine load failed (mammoth): ${String(e?.message || e)}`],
    };
  }

  try {
    const result = await mammoth.extractRawText({ path: absPath });
    const text = (result?.value ?? "").trim();

    return {
      kind: "DOCX",
      detectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      isScanned: false,
      overallConfidence: text ? 0.95 : 0,
      pages: [{ pageNumber: 1, text, confidence: text ? 0.95 : 0, width: null, height: null, tokens: null }],
    };
  } catch (e: any) {
    return {
      kind: "DOCX",
      detectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      isScanned: false,
      overallConfidence: 0,
      pages: [{ pageNumber: 1, text: "", confidence: 0, width: null, height: null, tokens: null }],
      warnings: [`DOCX extract failed: ${String(e?.message || e)}`],
    };
  }
}

export async function extractFile(storagePath: string, originalFilename?: string): Promise<ExtractFileResult> {
  const absPath = path.isAbsolute(storagePath) ? storagePath : path.join(process.cwd(), storagePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const ext = path.extname(originalFilename || absPath).toLowerCase();

  if (ext === ".pdf") return extractPdf(absPath);
  if (ext === ".docx") return extractDocx(absPath);

  return {
    kind: "UNKNOWN",
    detectedMime: null,
    isScanned: false,
    overallConfidence: 0,
    pages: [{ pageNumber: 1, text: "", confidence: 0, width: null, height: null, tokens: null }],
    warnings: [`Unsupported file type: ${ext || "(none)"}`],
  };
}
