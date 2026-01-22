import fs from "fs";
import path from "path";


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



async function extractPdf(absPath: string): Promise<ExtractFileResult> {
  const buf = fs.readFileSync(absPath);

// pdf-parse is easiest for text extraction; if it returns near-empty text, we treat as scanned.
const mod = await import("pdf-parse");

type PdfParseResult = { text?: string; numpages?: number };
type PdfParseFn = (b: Buffer) => Promise<PdfParseResult>;

// pdf-parse can be CJS or ESM depending on environment; support both without `any`
const pdfParse = (("default" in mod ? (mod as { default: unknown }).default : mod) as unknown) as PdfParseFn;

const parsed = await pdfParse(buf);
const fullText = (parsed?.text ?? "").trim();
const pageCount = parsed?.numpages ?? null;

const looksEmpty = fullText.length < 40; // heuristic
const isScanned = looksEmpty;

const pages: ExtractedPageResult[] = [
  {
    pageNumber: 1,
    text: fullText,
    confidence: isScanned ? 0 : 0.9,
    width: null,
    height: null,
    tokens: null,
  },
];


  return {
    kind: "PDF",
    detectedMime: "application/pdf",
    isScanned,
    overallConfidence: isScanned ? 0 : 0.9,
    pages,
    warnings: pageCount && pageCount > 1 ? ["Multi-page PDF: page-splitting not implemented yet."] : undefined,
  };
}

async function extractDocx(absPath: string): Promise<ExtractFileResult> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: absPath });
  const text = (result?.value ?? "").trim();

  return {
    kind: "DOCX",
    detectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    isScanned: false,
    overallConfidence: text ? 0.95 : 0,
    pages: [
      {
        pageNumber: 1,
        text,
        confidence: text ? 0.95 : 0,
        width: null,
        height: null,
        tokens: null,
      },
    ],
    warnings: undefined,
  };
}

export async function extractFile(storagePath: string, originalFilename?: string): Promise<ExtractFileResult> {
  const absPath = path.isAbsolute(storagePath) ? storagePath : path.join(process.cwd(), storagePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const ext = path.extname(originalFilename || absPath).toLowerCase();

  // quick signature
  

  if (ext === ".pdf") return extractPdf(absPath);
  if (ext === ".docx") return extractDocx(absPath);

  return {
    kind: "UNKNOWN",
    detectedMime: null,
    isScanned: false,
    overallConfidence: 0,
    pages: [
      { pageNumber: 1, text: "", confidence: 0, width: null, height: null, tokens: null },
    ],
    warnings: [`Unsupported file type: ${ext || "(none)"}`],
  };
}
