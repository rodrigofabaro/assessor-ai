import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { pathToFileURL } from "url";

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
const MIN_CHARS_PER_PAGE = 20; // used when using PDF.js
const MIN_TOTAL_TEXT = 50; // final “is this scanned?” truth test
const MAX_PAGES_GUARD = 500;
const SUBPROCESS_TEXT_MIN = 100; // accept subprocess extraction if it returns at least this many chars

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

/**
 * Robustly convert PDF.js textContent items into readable text.
 * Handles PDFs where items may have empty `str` but have `chars`.
 */
function itemsToText(items: any[]): string {
  const parts: string[] = [];

  for (const it of items) {
    if (typeof it?.str === "string" && it.str.trim()) {
      parts.push(it.str);
      continue;
    }

    if (Array.isArray(it?.chars)) {
      const s = it.chars
        .map((c: any) => (typeof c?.str === "string" ? c.str : ""))
        .join("");
      if (s.trim()) parts.push(s);
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Extract JSON from stdout even if the tool prints warnings/noise.
 * We take the LAST {...} block from stdout and parse that.
 */
function parseJsonFromNoisyStdout(stdout: string): any {
  const lastOpen = stdout.lastIndexOf("{");
  const lastClose = stdout.lastIndexOf("}");
  if (lastOpen === -1 || lastClose === -1 || lastClose <= lastOpen) {
    throw new Error(`No JSON object found in stdout.\nSTDOUT:\n${stdout}`);
  }
  const jsonText = stdout.slice(lastOpen, lastClose + 1);
  return JSON.parse(jsonText);
}

/**
 * Run pdf-parse as an external Node process.
 * This avoids Next/Webpack/module-format weirdness.
 */
function runPdfParseInSubprocess(absPath: string): Promise<{ text: string; numpages: number | null }> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(process.cwd(), "scripts", "pdf-parse-extract.mjs");

    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Missing script: ${scriptPath}`));
    }
    if (!fs.existsSync(absPath)) {
      return reject(new Error(`Missing PDF: ${absPath}`));
    }

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

function computeIsScannedFromPages(pages: ExtractedPageResult[]): boolean {
  const combined = pages.map((p) => p.text || "").join("\n").trim();
  return combined.length < MIN_TOTAL_TEXT;
}

async function extractPdf(absPath: string): Promise<ExtractFileResult> {
  const warnings: string[] = [];

  const buf = fs.readFileSync(absPath);
  const data = new Uint8Array(buf);

  // ---------- Attempt 1: pdf-parse via subprocess ----------
  try {
    const parsed = await withTimeout(runPdfParseInSubprocess(absPath), PDF_PAGE_TIMEOUT_MS, "pdf-parse subprocess");
    const text = (parsed.text ?? "").trim();

    warnings.push(`pdf-parse subprocess: len=${text.length}, numpages=${parsed.numpages ?? "?"}`);

    if (text.length >= SUBPROCESS_TEXT_MIN) {
      const pages: ExtractedPageResult[] = [
        { pageNumber: 1, text, confidence: 0.75, width: null, height: null, tokens: null },
      ];

      const isScanned = computeIsScannedFromPages(pages); // truth based on actual extracted text
      const overallConfidence = isScanned ? 0 : 0.75;

      return {
        kind: "PDF",
        detectedMime: "application/pdf",
        isScanned,
        overallConfidence,
        pages,
        warnings: warnings.length ? warnings : undefined,
      };
    }
  } catch (e: any) {
    warnings.push(`pdf-parse subprocess failed: ${String(e?.message || e)}`);
    // Continue to PDF.js
  }

  // ---------- Attempt 2: PDF.js (structured per-page) ----------
  let pdfjs: any;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (e: any) {
    return {
      kind: "PDF",
      detectedMime: "application/pdf",
      isScanned: true,
      overallConfidence: 0,
      pages: [{ pageNumber: 1, text: "", confidence: 0, width: null, height: null, tokens: null }],
      warnings: [...warnings, `PDF engine load failed (pdfjs-dist): ${String(e?.message || e)}`],
    };
  }

  try {
    if (pdfjs?.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "";
  } catch {
    // ignore
  }

  let doc: any;
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

    doc = await withTimeout(loadingTask.promise, PDF_PAGE_TIMEOUT_MS, "pdf.getDocument()");
  } catch (e: any) {
    return {
      kind: "PDF",
      detectedMime: "application/pdf",
      isScanned: true,
      overallConfidence: 0,
      pages: [{ pageNumber: 1, text: "", confidence: 0, width: null, height: null, tokens: null }],
      warnings: [...warnings, `PDF open failed: ${String(e?.message || e)}`],
    };
  }

  const numPages = Number(doc?.numPages ?? 0);
  if (!numPages || !Number.isFinite(numPages)) {
    return {
      kind: "PDF",
      detectedMime: "application/pdf",
      isScanned: true,
      overallConfidence: 0,
      pages: [{ pageNumber: 1, text: "", confidence: 0, width: null, height: null, tokens: null }],
      warnings: [...warnings, "PDF has no readable pages (numPages missing/invalid)."],
    };
  }

  if (numPages > MAX_PAGES_GUARD) {
    return {
      kind: "PDF",
      detectedMime: "application/pdf",
      isScanned: true,
      overallConfidence: 0,
      pages: [{ pageNumber: 1, text: "", confidence: 0, width: null, height: null, tokens: null }],
      warnings: [...warnings, `PDF too large (${numPages} pages). Refusing extraction (guard=${MAX_PAGES_GUARD}).`],
    };
  }

  const pages: ExtractedPageResult[] = [];
  let pagesWithText = 0;

  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await withTimeout(doc.getPage(i), PDF_PAGE_TIMEOUT_MS, `pdf.getPage(${i})`);
      const viewport = page.getViewport({ scale: 1.0 });

      let textContent: any;
      try {
        textContent = await withTimeout(
          page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false }),
          PDF_PAGE_TIMEOUT_MS,
          `pdf.getTextContent(${i})`
        );
      } catch {
        textContent = await withTimeout(page.getTextContent(), PDF_PAGE_TIMEOUT_MS, `pdf.getTextContent(${i})`);
      }

      const items = Array.isArray(textContent?.items) ? textContent.items : [];
      const text = itemsToText(items);

      if (text.length >= MIN_CHARS_PER_PAGE) pagesWithText++;

      pages.push({
        pageNumber: i,
        text,
        confidence: text ? 0.9 : 0,
        width: Number.isFinite(viewport?.width) ? Math.round(viewport.width) : null,
        height: Number.isFinite(viewport?.height) ? Math.round(viewport.height) : null,
        tokens: null,
      });
    } catch (e: any) {
      warnings.push(`Page ${i} extraction failed: ${String(e?.message || e)}`);
      pages.push({ pageNumber: i, text: "", confidence: 0, width: null, height: null, tokens: null });
    }
  }

  // FINAL truth: scanned or not based on combined extracted text
  const isScanned = computeIsScannedFromPages(pages);

  const fraction = pages.length ? pagesWithText / pages.length : 0;
  const overallConfidence = isScanned ? 0 : Math.max(0.6, Math.min(0.95, fraction * 0.95));

  if (isScanned) {
    warnings.push("PDF appears scanned/image-only (insufficient extractable text). OCR will be required.");
  }

  return {
    kind: "PDF",
    detectedMime: "application/pdf",
    isScanned,
    overallConfidence,
    pages,
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
