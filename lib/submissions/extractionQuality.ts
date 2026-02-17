import {
  evaluateExtractionReadiness,
  type ExtractionReadinessInput,
} from "@/lib/grading/extractionQualityGate";

export type ExtractionQualityBand = "HIGH" | "MEDIUM" | "LOW";
export type ExtractionQualityRouteHint = "AUTO_READY" | "NEEDS_REVIEW" | "BLOCKED";

export type ExtractionQualityResult = {
  score: number;
  band: ExtractionQualityBand;
  routeHint: ExtractionQualityRouteHint;
  ready: boolean;
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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) ? value : fallback;
}

export function computeExtractionQuality(input: ExtractionReadinessInput): ExtractionQualityResult {
  const gate = evaluateExtractionReadiness(input);
  const { extractedChars, pageCount, overallConfidence, runStatus, coverMetadataReady } = gate.metrics;

  // Weighted quality score from deterministic extraction metrics.
  // If cover metadata is ready, reduce dependence on full-body extracted chars.
  const charsWeight = coverMetadataReady ? 25 : 45;
  const charsScore = clamp(extractedChars / 1200, 0, 1) * charsWeight;
  const confScore = clamp(overallConfidence / 0.85, 0, 1) * 35;
  const pageBase = pageCount > 0 ? 10 : 0;
  const pageDepth = clamp(pageCount / 4, 0, 1) * 10;
  const coverBonus = coverMetadataReady ? 20 : 0;

  let score = charsScore + confScore + pageBase + pageDepth + coverBonus;

  // Penalize noisy runs and hard blockers.
  score -= gate.warnings.length * 3;
  score -= gate.blockers.length * 8;

  // Run-state caps prevent optimistic scoring while extraction is weak/incomplete.
  const st = String(runStatus || "").toUpperCase();
  if (st === "NEEDS_OCR") score = Math.min(score, 25);
  if (st === "FAILED") score = 0;
  if (st === "RUNNING" || st === "PENDING") score = Math.min(score, 35);

  score = Math.round(clamp(score, 0, 100));

  const autoReadyMin = clamp(envNumber("AUTO_READY_MIN_QUALITY_SCORE", 72), 55, 95);
  const blockedMax = clamp(envNumber("BLOCKED_MAX_QUALITY_SCORE", 40), 10, 65);

  const band: ExtractionQualityBand = score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";
  const routeHint: ExtractionQualityRouteHint =
    score <= blockedMax ? "BLOCKED" : score >= autoReadyMin ? "AUTO_READY" : "NEEDS_REVIEW";

  return {
    score,
    band,
    routeHint,
    ready: gate.ok && routeHint === "AUTO_READY",
    blockers: gate.blockers,
    warnings: gate.warnings,
    metrics: gate.metrics,
  };
}
