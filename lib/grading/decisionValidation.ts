export type GradeDecisionEvidence = {
  page: number;
  quote: string;
};

export type GradeDecisionCriterionCheck = {
  code: string;
  met: boolean;
  comment: string;
  evidence: GradeDecisionEvidence[];
};

export type GradeDecision = {
  overallGrade: "PASS" | "MERIT" | "DISTINCTION" | "REFER";
  feedbackSummary: string;
  feedbackBullets: string[];
  criterionChecks: GradeDecisionCriterionCheck[];
  confidence: number;
};

export type GradeDecisionValidationResult =
  | { ok: true; data: GradeDecision }
  | { ok: false; errors: string[] };

const ALLOWED_GRADES = new Set(["PASS", "MERIT", "DISTINCTION", "REFER", "FAIL"]);

function normalizeText(input: unknown) {
  return String(input ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeGrade(input: unknown): GradeDecision["overallGrade"] | null {
  const raw = String(input ?? "").trim().toUpperCase();
  if (!ALLOWED_GRADES.has(raw)) return null;
  return raw === "FAIL" ? "REFER" : (raw as GradeDecision["overallGrade"]);
}

function isValidEvidence(input: any) {
  if (!input || typeof input !== "object") return false;
  const page = Number(input.page);
  const quote = normalizeText(input.quote);
  return Number.isInteger(page) && page > 0 && quote.length >= 6;
}

export function validateGradeDecision(input: unknown, criteriaCodes: string[]): GradeDecisionValidationResult {
  const errors: string[] = [];
  const payload = (input && typeof input === "object" ? input : {}) as Record<string, any>;

  const grade = normalizeGrade(payload.overallGrade);
  if (!grade) errors.push("overallGrade must be one of PASS/MERIT/DISTINCTION/REFER (FAIL accepted and normalized to REFER).");

  const feedbackSummary = normalizeText(payload.feedbackSummary);
  if (!feedbackSummary) errors.push("feedbackSummary is required.");

  const feedbackBulletsRaw = Array.isArray(payload.feedbackBullets) ? payload.feedbackBullets : [];
  const feedbackBullets = feedbackBulletsRaw
    .map((item: unknown) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 24);
  if (!feedbackBullets.length) errors.push("feedbackBullets must contain at least one non-empty bullet.");

  const expectedCodes = Array.from(
    new Set((criteriaCodes || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))
  );
  const expectedCodeSet = new Set(expectedCodes);

  const checksRaw = Array.isArray(payload.criterionChecks) ? payload.criterionChecks : [];
  if (!checksRaw.length) errors.push("criterionChecks is required.");

  const checks: GradeDecisionCriterionCheck[] = [];
  const seenCodes = new Set<string>();
  for (const row of checksRaw) {
    const code = String(row?.code || "").trim().toUpperCase();
    const met = Boolean(row?.met);
    const comment = normalizeText(row?.comment);
    const evidenceRaw = Array.isArray(row?.evidence) ? row.evidence : [];
    const evidence = evidenceRaw.filter(isValidEvidence).map((ev: any) => ({
      page: Number(ev.page),
      quote: normalizeText(ev.quote),
    }));

    if (!code) {
      errors.push("criterionChecks[].code is required.");
      continue;
    }
    if (!expectedCodeSet.has(code)) {
      errors.push(`criterionChecks contains unknown code: ${code}.`);
      continue;
    }
    if (seenCodes.has(code)) {
      errors.push(`criterionChecks contains duplicate code: ${code}.`);
      continue;
    }
    seenCodes.add(code);
    if (!comment) errors.push(`criterionChecks[${code}].comment is required.`);
    if (!Array.isArray(row?.evidence) || !evidence.length) {
      errors.push(`criterionChecks[${code}].evidence must contain at least one page-linked quote.`);
    }
    checks.push({ code, met, comment, evidence });
  }

  for (const code of expectedCodes) {
    if (!seenCodes.has(code)) errors.push(`Missing criterion check for code: ${code}.`);
  }

  const confidenceNum = Number(payload.confidence);
  const confidence = Number.isFinite(confidenceNum) ? Math.max(0, Math.min(1, confidenceNum)) : NaN;
  if (!Number.isFinite(confidenceNum)) errors.push("confidence must be a number.");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      overallGrade: grade!,
      feedbackSummary,
      feedbackBullets,
      criterionChecks: checks,
      confidence,
    },
  };
}
