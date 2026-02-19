export type GradingInputMode = "EXTRACTED_TEXT" | "RAW_PDF_IMAGES";
export type GradingInputRequestedMode = "AUTO" | "EXTRACTED" | "RAW";

export type GradingInputStrategyInput = {
  requestedMode?: string | null;
  isPdf: boolean;
  extractionMode?: string | null;
  coverReady?: boolean;
  extractionGateOk: boolean;
  extractedChars: number;
  extractionConfidence: number;
  minExtractedChars?: number;
  minExtractionConfidence?: number;
};

export type GradingInputStrategyResult = {
  mode: GradingInputMode;
  requestedMode: GradingInputRequestedMode;
  reason: string;
  usedThresholds: {
    minExtractedChars: number;
    minExtractionConfidence: number;
  };
};

function clamp01(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeRequestedMode(value: unknown): GradingInputRequestedMode {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "RAW" || raw === "RAW_PDF_IMAGES") return "RAW";
  if (raw === "EXTRACTED" || raw === "EXTRACTED_TEXT") return "EXTRACTED";
  return "AUTO";
}

export function chooseGradingInputStrategy(
  input: GradingInputStrategyInput
): GradingInputStrategyResult {
  const requestedMode = normalizeRequestedMode(input.requestedMode);
  const minExtractedChars = Math.max(
    300,
    Math.floor(Number(input.minExtractedChars ?? 2200))
  );
  const minExtractionConfidence = Math.max(
    0.55,
    Math.min(0.99, Number(input.minExtractionConfidence ?? 0.84))
  );
  const extractionMode = String(input.extractionMode || "").trim().toUpperCase();
  const coverReady = Boolean(input.coverReady);
  const extractionConfidence = clamp01(input.extractionConfidence);
  const extractedChars = Math.max(0, Math.floor(Number(input.extractedChars || 0)));

  const looksStrongForExtracted =
    input.extractionGateOk &&
    extractedChars >= minExtractedChars &&
    extractionConfidence >= minExtractionConfidence &&
    (extractionMode !== "COVER_ONLY" || coverReady);

  if (requestedMode === "EXTRACTED") {
    return {
      mode: "EXTRACTED_TEXT",
      requestedMode,
      reason: "Forced extracted mode by configuration.",
      usedThresholds: { minExtractedChars, minExtractionConfidence },
    };
  }

  if (requestedMode === "RAW") {
    if (input.isPdf) {
      return {
        mode: "RAW_PDF_IMAGES",
        requestedMode,
        reason: "Forced raw mode by configuration.",
        usedThresholds: { minExtractedChars, minExtractionConfidence },
      };
    }
    return {
      mode: "EXTRACTED_TEXT",
      requestedMode,
      reason: "Raw mode requested but submission is not PDF; using extracted mode.",
      usedThresholds: { minExtractedChars, minExtractionConfidence },
    };
  }

  if (!input.isPdf) {
    return {
      mode: "EXTRACTED_TEXT",
      requestedMode,
      reason: "AUTO mode: non-PDF submission uses extracted mode.",
      usedThresholds: { minExtractedChars, minExtractionConfidence },
    };
  }

  if (looksStrongForExtracted) {
    return {
      mode: "EXTRACTED_TEXT",
      requestedMode,
      reason: `AUTO mode: extraction strong (chars=${extractedChars}, conf=${extractionConfidence.toFixed(2)}).`,
      usedThresholds: { minExtractedChars, minExtractionConfidence },
    };
  }

  const weakReasons: string[] = [];
  if (!input.extractionGateOk) weakReasons.push("extraction gate not ready");
  if (extractedChars < minExtractedChars) weakReasons.push(`chars ${extractedChars} < ${minExtractedChars}`);
  if (extractionConfidence < minExtractionConfidence) {
    weakReasons.push(`confidence ${extractionConfidence.toFixed(2)} < ${minExtractionConfidence.toFixed(2)}`);
  }
  if (extractionMode === "COVER_ONLY" && !coverReady) weakReasons.push("cover-only not ready");

  return {
    mode: "RAW_PDF_IMAGES",
    requestedMode,
    reason: `AUTO mode: extraction weak (${weakReasons.join("; ")}); switching to raw PDF images.`,
    usedThresholds: { minExtractedChars, minExtractionConfidence },
  };
}
