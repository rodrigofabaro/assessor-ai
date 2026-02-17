import { isCoverMetadataReady } from "@/lib/submissions/coverMetadata";

type ExtractionRunLike = {
  status?: string | null;
  overallConfidence?: number | null;
  pageCount?: number | null;
  warnings?: unknown;
  sourceMeta?: unknown;
};

export type ExtractionReadinessInput = {
  submissionStatus?: string | null;
  extractedText?: string | null;
  latestRun?: ExtractionRunLike | null;
};

export type ExtractionReadinessResult = {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  metrics: {
    extractedChars: number;
    pageCount: number;
    overallConfidence: number;
    runStatus: string;
    coverMetadataReady: boolean;
  };
};

function parseWarnings(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v || "").trim()).filter(Boolean);
  if (!raw || typeof raw !== "object") return [];
  const maybe = (raw as any).warnings;
  if (Array.isArray(maybe)) return maybe.map((v: unknown) => String(v || "").trim()).filter(Boolean);
  return [];
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

export function evaluateExtractionReadiness(input: ExtractionReadinessInput): ExtractionReadinessResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const minChars = Math.max(200, Math.floor(envNumber("GRADING_MIN_EXTRACTED_CHARS", 700)));
  const minConfidence = Math.max(0.4, Math.min(0.99, envNumber("GRADING_MIN_EXTRACTION_CONFIDENCE", 0.68)));

  const extractedText = String(input.extractedText || "");
  const extractedChars = extractedText.trim().length;
  const run = input.latestRun || null;
  const runStatus = String(run?.status || "").toUpperCase();
  const pageCount = Number(run?.pageCount || 0);
  const overallConfidence = Number(run?.overallConfidence || 0);
  const runWarnings = parseWarnings(run?.warnings);
  const coverReady = isCoverMetadataReady((run?.sourceMeta as any)?.coverMetadata);

  if (!run) blockers.push("No extraction run found.");
  if (runStatus === "NEEDS_OCR") blockers.push("Extraction flagged as NEEDS_OCR. Run OCR/correction before grading.");
  if (runStatus === "FAILED") blockers.push("Latest extraction run failed.");
  if (runStatus === "RUNNING" || runStatus === "PENDING") blockers.push("Extraction is still in progress.");
  if (runStatus && !["DONE", "NEEDS_OCR", "FAILED", "RUNNING", "PENDING"].includes(runStatus)) {
    warnings.push(`Unknown extraction status: ${runStatus}.`);
  }

  if (extractedChars < minChars) {
    if (coverReady) {
      warnings.push(
        `Extracted body text is short (${extractedChars} chars), but cover metadata is available.`
      );
    } else {
      blockers.push(`Extracted text too short (${extractedChars} chars; minimum ${minChars}).`);
    }
  }
  if (Number.isFinite(overallConfidence) && overallConfidence > 0 && overallConfidence < minConfidence) {
    blockers.push(
      `Extraction confidence too low (${overallConfidence.toFixed(2)}; minimum ${minConfidence.toFixed(2)}).`
    );
  }
  if (pageCount <= 0) warnings.push("Extraction page count is missing.");
  if (runWarnings.length) warnings.push(...runWarnings.map((w) => `Extraction warning: ${w}`));

  const status = String(input.submissionStatus || "").toUpperCase();
  if (status === "NEEDS_OCR") blockers.push("Submission status is NEEDS_OCR.");

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    metrics: {
      extractedChars,
      pageCount: pageCount > 0 ? pageCount : 0,
      overallConfidence: Number.isFinite(overallConfidence) ? overallConfidence : 0,
      runStatus,
      coverMetadataReady: coverReady,
    },
  };
}
