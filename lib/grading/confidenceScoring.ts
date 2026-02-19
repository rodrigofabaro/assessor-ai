type ConfidenceCriterionCheck = {
  decision?: string | null;
  confidence?: number | null;
  evidence?: Array<unknown> | null;
};

type EvidenceDensitySummary = {
  criteriaCount?: number;
  totalCitations?: number;
  criteriaWithoutEvidence?: number;
};

type ConfidenceCap = {
  name: string;
  value: number;
  reason: string;
};

export type GradingConfidenceInput = {
  modelConfidence: number;
  extractionConfidence: number;
  extractionMode?: string | null;
  modalityMissingCount?: number;
  readinessChecklist?: Record<string, boolean>;
  criteriaAlignmentOverlapRatio?: number;
  criteriaAlignmentMismatchCount?: number;
  criterionChecks?: ConfidenceCriterionCheck[];
  evidenceDensitySummary?: EvidenceDensitySummary;
  modalityMissingCap?: number;
  bandCapWasCapped?: boolean;
};

export type GradingConfidenceResult = {
  finalConfidence: number;
  weightedBaseConfidence: number;
  rawConfidenceBeforeCaps: number;
  modelConfidence: number;
  criterionAverageConfidence: number;
  evidenceScore: number;
  extractionConfidence: number;
  bonuses: {
    extractionHighConfidenceBonus: number;
  };
  penalties: {
    unclearRatioPenalty: number;
    lowCriterionConfidencePenalty: number;
    missingEvidencePenalty: number;
    achievedWithoutEvidencePenalty: number;
    modalityMissingPenalty: number;
    readinessPenalty: number;
    coverOnlyPenalty: number;
    criteriaAlignmentPenalty: number;
    extractionLowPenalty: number;
    bandCapPenalty: number;
  };
  capsApplied: ConfidenceCap[];
  signals: {
    totalCriteria: number;
    unclearCount: number;
    lowCriterionConfidenceCount: number;
    criteriaWithoutEvidence: number;
    achievedWithoutEvidenceCount: number;
    totalCitations: number;
    citationsPerCriterion: number;
    readinessFailures: string[];
    criteriaAlignmentOverlapRatio: number;
    criteriaAlignmentMismatchCount: number;
    extractionMode: string;
    modalityMissingCount: number;
  };
  wasCapped: boolean;
};

function clamp01(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function computeGradingConfidence(input: GradingConfidenceInput): GradingConfidenceResult {
  const modelConfidence = clamp01(input.modelConfidence);
  const extractionConfidence = clamp01(input.extractionConfidence);
  const extractionMode = String(input.extractionMode || "").trim().toUpperCase() || "UNKNOWN";

  const rows = Array.isArray(input.criterionChecks) ? input.criterionChecks : [];
  const rowCount = rows.length;
  const criteriaCountFromSummary = Number(input.evidenceDensitySummary?.criteriaCount || 0);
  const totalCriteria = Math.max(1, criteriaCountFromSummary > 0 ? criteriaCountFromSummary : rowCount || 1);

  const criterionAverageConfidence =
    rowCount > 0
      ? clamp01(
          rows.reduce((sum, row) => sum + clamp01(row?.confidence), 0) / Math.max(1, rowCount)
        )
      : modelConfidence;

  const unclearCount = rows.filter(
    (row) => String(row?.decision || "").trim().toUpperCase() === "UNCLEAR"
  ).length;
  const lowCriterionConfidenceCount = rows.filter((row) => clamp01(row?.confidence) < 0.55).length;
  const achievedWithoutEvidenceCount = rows.filter((row) => {
    const decision = String(row?.decision || "").trim().toUpperCase();
    const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
    return decision === "ACHIEVED" && evidence.length === 0;
  }).length;
  const criteriaWithoutEvidence =
    Number.isFinite(Number(input.evidenceDensitySummary?.criteriaWithoutEvidence))
      ? Math.max(0, Number(input.evidenceDensitySummary?.criteriaWithoutEvidence || 0))
      : rows.filter((row) => {
          const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
          return evidence.length === 0;
        }).length;
  const totalCitations =
    Number.isFinite(Number(input.evidenceDensitySummary?.totalCitations))
      ? Math.max(0, Number(input.evidenceDensitySummary?.totalCitations || 0))
      : rows.reduce((sum, row) => {
          const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
          return sum + evidence.length;
        }, 0);
  const citationsPerCriterion = totalCitations / Math.max(1, totalCriteria);
  const noEvidenceRatio = Math.max(0, Math.min(1, criteriaWithoutEvidence / Math.max(1, totalCriteria)));
  const unclearRatio = Math.max(0, Math.min(1, unclearCount / Math.max(1, totalCriteria)));
  const lowConfidenceRatio = Math.max(0, Math.min(1, lowCriterionConfidenceCount / Math.max(1, totalCriteria)));

  const citationScore = clamp01(citationsPerCriterion / 1.5);
  const evidenceScore = clamp01(citationScore - noEvidenceRatio * 0.35);

  const readinessEntries = Object.entries(input.readinessChecklist || {});
  const readinessFailures = readinessEntries
    .filter(([, ok]) => !Boolean(ok))
    .map(([key]) => key);
  const readinessFailureCount = readinessFailures.length;

  const modalityMissingCount = Math.max(0, Math.floor(Number(input.modalityMissingCount || 0)));
  const criteriaAlignmentOverlapRatio = clamp01(
    Number.isFinite(Number(input.criteriaAlignmentOverlapRatio))
      ? Number(input.criteriaAlignmentOverlapRatio)
      : 1
  );
  const criteriaAlignmentMismatchCount = Math.max(
    0,
    Math.floor(Number(input.criteriaAlignmentMismatchCount || 0))
  );

  const penalties = {
    unclearRatioPenalty: unclearRatio * 0.18,
    lowCriterionConfidencePenalty: lowConfidenceRatio * 0.12,
    missingEvidencePenalty: noEvidenceRatio * 0.2,
    achievedWithoutEvidencePenalty: achievedWithoutEvidenceCount > 0 ? 0.2 : 0,
    modalityMissingPenalty: Math.min(0.25, modalityMissingCount * 0.08),
    readinessPenalty: Math.min(0.2, readinessFailureCount * 0.05),
    // Extraction-specific penalties are intentionally disabled by policy.
    coverOnlyPenalty: 0,
    criteriaAlignmentPenalty: Math.min(0.12, (1 - criteriaAlignmentOverlapRatio) * 0.18 + criteriaAlignmentMismatchCount * 0.02),
    extractionLowPenalty: 0,
    bandCapPenalty: input.bandCapWasCapped ? 0.04 : 0,
  };
  const extractionHighConfidenceBonus =
    extractionConfidence >= 0.97
      ? Math.min(0.04, ((extractionConfidence - 0.97) / 0.03) * 0.04)
      : 0;

  const weightedBaseConfidence = clamp01(
    modelConfidence * 0.4 +
      criterionAverageConfidence * 0.35 +
      evidenceScore * 0.25
  );
  const penaltyTotal = Object.values(penalties).reduce((sum, p) => sum + p, 0);
  const rawConfidenceBeforeCaps = clamp01(weightedBaseConfidence + extractionHighConfidenceBonus - penaltyTotal);

  const capsApplied: ConfidenceCap[] = [];
  let cappedConfidence = rawConfidenceBeforeCaps;
  const applyCap = (name: string, value: number, reason: string) => {
    const cap = clamp01(value);
    if (cappedConfidence > cap) {
      cappedConfidence = cap;
      capsApplied.push({ name, value: round3(cap), reason });
    }
  };

  if (modalityMissingCount > 0) {
    const modalityCap = Math.max(0.2, Math.min(0.95, Number(input.modalityMissingCap ?? 0.65)));
    applyCap(
      "modality_missing_cap",
      modalityCap,
      `Required modality evidence missing in ${modalityMissingCount} section(s).`
    );
  }

  if (noEvidenceRatio >= 0.5) {
    applyCap("evidence_gap_cap", 0.72, "Half or more criteria have no cited evidence.");
  } else if (noEvidenceRatio >= 0.3) {
    applyCap("evidence_gap_cap", 0.8, "Many criteria have no cited evidence.");
  } else if (noEvidenceRatio >= 0.2) {
    applyCap("evidence_gap_cap", 0.86, "Some criteria have no cited evidence.");
  }

  if (readinessFailureCount > 0) {
    const readinessCap = Math.max(0.68, 0.9 - Math.min(0.2, readinessFailureCount * 0.04));
    applyCap(
      "readiness_cap",
      readinessCap,
      `${readinessFailureCount} readiness check(s) are not satisfied.`
    );
  }

  if (achievedWithoutEvidenceCount > 0) {
    applyCap(
      "achieved_without_evidence_cap",
      0.4,
      "One or more criteria are marked ACHIEVED without evidence."
    );
  }

  const finalConfidence = clamp01(Math.max(0.2, cappedConfidence));

  return {
    finalConfidence: round3(finalConfidence),
    weightedBaseConfidence: round3(weightedBaseConfidence),
    rawConfidenceBeforeCaps: round3(rawConfidenceBeforeCaps),
    modelConfidence: round3(modelConfidence),
    criterionAverageConfidence: round3(criterionAverageConfidence),
    evidenceScore: round3(evidenceScore),
    extractionConfidence: round3(extractionConfidence),
    bonuses: {
      extractionHighConfidenceBonus: round3(extractionHighConfidenceBonus),
    },
    penalties: {
      unclearRatioPenalty: round3(penalties.unclearRatioPenalty),
      lowCriterionConfidencePenalty: round3(penalties.lowCriterionConfidencePenalty),
      missingEvidencePenalty: round3(penalties.missingEvidencePenalty),
      achievedWithoutEvidencePenalty: round3(penalties.achievedWithoutEvidencePenalty),
      modalityMissingPenalty: round3(penalties.modalityMissingPenalty),
      readinessPenalty: round3(penalties.readinessPenalty),
      coverOnlyPenalty: round3(penalties.coverOnlyPenalty),
      criteriaAlignmentPenalty: round3(penalties.criteriaAlignmentPenalty),
      extractionLowPenalty: round3(penalties.extractionLowPenalty),
      bandCapPenalty: round3(penalties.bandCapPenalty),
    },
    capsApplied,
    signals: {
      totalCriteria,
      unclearCount,
      lowCriterionConfidenceCount,
      criteriaWithoutEvidence,
      achievedWithoutEvidenceCount,
      totalCitations,
      citationsPerCriterion: round3(citationsPerCriterion),
      readinessFailures,
      criteriaAlignmentOverlapRatio: round3(criteriaAlignmentOverlapRatio),
      criteriaAlignmentMismatchCount,
      extractionMode,
      modalityMissingCount,
    },
    wasCapped: capsApplied.length > 0,
  };
}
