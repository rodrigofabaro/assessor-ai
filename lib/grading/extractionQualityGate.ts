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
    extractionMode: string;
  };
};

function parseWarnings(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v || "").trim()).filter(Boolean);
  if (!raw || typeof raw !== "object") return [];
  const maybe = (raw as any).warnings;
  if (Array.isArray(maybe)) return maybe.map((v: unknown) => String(v || "").trim()).filter(Boolean);
  return [];
}

function inferExtractedChars(extractedText: string, sourceMeta: any): number {
  const textChars = String(extractedText || "").trim().length;
  if (textChars > 0) return textChars;
  const candidates = [
    Number(sourceMeta?.derivedTextChars || 0),
    Number(sourceMeta?.extractedChars || 0),
    Number(sourceMeta?.qualitySignals?.derivedTextChars || 0),
  ].filter((n) => Number.isFinite(n) && n > 0);
  if (!candidates.length) return 0;
  return Math.max(...candidates.map((n) => Math.floor(n)));
}

function hasExtractedCharSignal(extractedText: string, sourceMeta: any): boolean {
  if (String(extractedText || "").trim().length > 0) return true;
  const candidates = [
    Number(sourceMeta?.derivedTextChars || 0),
    Number(sourceMeta?.extractedChars || 0),
    Number(sourceMeta?.qualitySignals?.derivedTextChars || 0),
  ];
  return candidates.some((n) => Number.isFinite(n) && n > 0);
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
  const minPages = Math.max(1, Math.floor(envNumber("GRADING_MIN_PAGE_COUNT", 1)));
  const maxWarningsBeforeBlock = Math.max(2, Math.floor(envNumber("GRADING_MAX_WARNINGS_BEFORE_BLOCK", 8)));

  const run = input.latestRun || null;
  const extractedText = String(input.extractedText || "");
  const sourceMeta = (run?.sourceMeta as any) || {};
  const extractedChars = inferExtractedChars(extractedText, sourceMeta);
  const hasCharSignal = hasExtractedCharSignal(extractedText, sourceMeta);
  const runStatus = String(run?.status || "").toUpperCase();
  const pageCount = Number(run?.pageCount || 0);
  const overallConfidence = Number(run?.overallConfidence || 0);
  const runWarnings = parseWarnings(run?.warnings);
  const extractionMode = String(sourceMeta?.extractionMode || "")
    .trim()
    .toUpperCase();
  const coverReady = isCoverMetadataReady(sourceMeta?.coverMetadata);

  if (!run) blockers.push("No extraction run found.");
  if (runStatus === "NEEDS_OCR") {
    if (extractionMode === "COVER_ONLY") {
      warnings.push("Extraction flagged as NEEDS_OCR, but cover-only mode is allowed to continue.");
    } else {
      blockers.push("Extraction flagged as NEEDS_OCR. Run OCR/correction before grading.");
    }
  }
  if (runStatus === "FAILED") blockers.push("Latest extraction run failed.");
  if (runStatus === "RUNNING" || runStatus === "PENDING") blockers.push("Extraction is still in progress.");
  if (runStatus && !["DONE", "NEEDS_OCR", "FAILED", "RUNNING", "PENDING"].includes(runStatus)) {
    warnings.push(`Unknown extraction status: ${runStatus}.`);
  }
  if (extractionMode === "COVER_ONLY" && !coverReady) {
    warnings.push("Cover-only extraction has incomplete cover metadata; complete it in submission review if needed.");
  }

  if (extractedChars < minChars) {
    if (!hasCharSignal) {
      warnings.push("Extracted text length signal is unavailable for this run.");
    } else if (extractionMode === "COVER_ONLY") {
      warnings.push(
        `Cover-only extraction has short body text (${extractedChars} chars), which is expected for this mode.`
      );
    } else if (coverReady) {
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
  if (pageCount > 0 && pageCount < minPages) {
    blockers.push(`Extraction page count too low (${pageCount}; minimum ${minPages}).`);
  }
  if (runWarnings.length) warnings.push(...runWarnings.map((w) => `Extraction warning: ${w}`));
  if (runWarnings.length >= maxWarningsBeforeBlock) {
    blockers.push(
      `Extraction produced too many warnings (${runWarnings.length}; maximum ${maxWarningsBeforeBlock - 1}).`
    );
  }

  const status = String(input.submissionStatus || "").toUpperCase();
  if (status === "NEEDS_OCR") {
    if (extractionMode === "COVER_ONLY") {
      warnings.push("Submission status is NEEDS_OCR, but cover-only mode is allowed to continue.");
    } else {
      blockers.push("Submission status is NEEDS_OCR.");
    }
  }

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
      extractionMode: extractionMode || "UNKNOWN",
    },
  };
}
