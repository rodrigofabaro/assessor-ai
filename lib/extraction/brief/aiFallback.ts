export type EquationLike = {
  id: string;
  latex?: string | null;
  confidence?: number;
  needsReview?: boolean;
};

export type EquationFallbackPolicy = {
  enabled: boolean;
  maxCandidates: number;
  minConfidenceToSkip: number;
};

export function defaultEquationFallbackPolicy(enabled: boolean): EquationFallbackPolicy {
  return {
    enabled,
    maxCandidates: 4,
    minConfidenceToSkip: 0.86,
  };
}

export function looksSuspiciousLatex(latex: string | null | undefined): boolean {
  const t = String(latex || "").trim();
  if (!t) return true;
  if (t.length < 6) return true;
  if (/sources?\s+of\s+information|routledge|pearson|wiley|bloomsbury/i.test(t)) return true;
  if (/^i\s*=?$/i.test(t) || /^=\s*1$/i.test(t)) return true;
  return false;
}

export function pickEquationFallbackCandidates(
  equations: EquationLike[],
  policy: EquationFallbackPolicy
): Set<string> {
  if (!policy.enabled || !Array.isArray(equations) || !equations.length) return new Set<string>();

  const scored = equations
    .filter((eq) => !!eq && String(eq.id || "").trim().length > 0)
    .map((eq) => {
      const hasLatex = !!String(eq.latex || "").trim();
      const confidence = Number(eq.confidence || 0);
      const needsReview = !!eq.needsReview;
      const suspicious = looksSuspiciousLatex(eq.latex);
      let score = 0;
      if (!hasLatex && needsReview) score += 100;
      if (!hasLatex) score += 40;
      if (needsReview) score += 30;
      if (suspicious) score += 20;
      if (confidence < policy.minConfidenceToSkip) score += Math.round((policy.minConfidenceToSkip - confidence) * 100);
      return { id: String(eq.id), score, hasLatex, needsReview, confidence, suspicious };
    })
    .filter((eq) => {
      if (!eq.hasLatex && eq.needsReview) return true;
      if (!eq.hasLatex) return true;
      if (eq.suspicious && eq.needsReview) return true;
      return eq.confidence < 0.55 && eq.needsReview;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, policy.maxCandidates));

  return new Set(scored.map((x) => x.id));
}

