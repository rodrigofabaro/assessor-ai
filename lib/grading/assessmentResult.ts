import type { GradeDecision } from "./decisionValidation";

export type StructuredGradingAuditMeta = {
  contractVersion: string;
  promptHash: string;
  model: string;
  gradedBy: string;
  startedAtIso: string;
  completedAtIso: string;
};

export function buildStructuredGradingV2(decision: GradeDecision, meta: StructuredGradingAuditMeta) {
  return {
    contractVersion: String(meta.contractVersion || "v2-structured-evidence"),
    promptHash: String(meta.promptHash || ""),
    model: String(meta.model || ""),
    gradedBy: String(meta.gradedBy || "system"),
    startedAt: String(meta.startedAtIso || ""),
    completedAt: String(meta.completedAtIso || ""),
    overallGradeWord: decision.overallGradeWord,
    resubmissionRequired: Boolean(decision.resubmissionRequired),
    confidence: Number(decision.confidence),
    criterionChecks: Array.isArray(decision.criterionChecks)
      ? decision.criterionChecks.map((row) => ({
          code: String(row.code || "").toUpperCase(),
          decision: row.decision,
          rationale: String(row.rationale || ""),
          confidence: Number(row.confidence),
          evidence: Array.isArray(row.evidence)
            ? row.evidence.map((ev) => ({
                page: Number(ev.page),
                ...(ev.quote ? { quote: String(ev.quote) } : {}),
                ...(ev.visualDescription ? { visualDescription: String(ev.visualDescription) } : {}),
              }))
            : [],
        }))
      : [],
  };
}

