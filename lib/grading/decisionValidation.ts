export type GradeDecisionStatus = "ACHIEVED" | "NOT_ACHIEVED" | "UNCLEAR";

export type GradeDecisionEvidence = {
  page: number;
  quote?: string;
  visualDescription?: string;
};

export type GradeDecisionCriterionCheck = {
  code: string;
  decision: GradeDecisionStatus;
  rationale: string;
  evidence: GradeDecisionEvidence[];
  confidence: number;
};

export type GradeDecision = {
  overallGradeWord: "REFER" | "PASS" | "PASS_ON_RESUBMISSION" | "MERIT" | "DISTINCTION";
  // legacy alias kept for existing callers/UI payloads
  overallGrade: "REFER" | "PASS" | "PASS_ON_RESUBMISSION" | "MERIT" | "DISTINCTION";
  resubmissionRequired: boolean;
  feedbackSummary: string;
  feedbackBullets: string[];
  criterionChecks: GradeDecisionCriterionCheck[];
  confidence: number;
};

export type GradeDecisionValidationResult =
  | { ok: true; data: GradeDecision }
  | { ok: false; errors: string[] };

const ALLOWED_GRADES = new Set(["REFER", "PASS", "PASS_ON_RESUBMISSION", "MERIT", "DISTINCTION", "FAIL"]);
const ALLOWED_DECISIONS = new Set(["ACHIEVED", "NOT_ACHIEVED", "UNCLEAR"]);

function normalizeText(input: unknown) {
  return String(input ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeGrade(input: unknown): GradeDecision["overallGradeWord"] | null {
  const raw = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  const normalized =
    raw === "PASS_ON_RESUB" || raw === "PASS_RESUBMISSION" ? "PASS_ON_RESUBMISSION" : raw;
  if (!ALLOWED_GRADES.has(normalized)) return null;
  if (normalized === "FAIL") return "REFER";
  return normalized as GradeDecision["overallGradeWord"];
}

function clamp01(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return NaN;
  return Math.max(0, Math.min(1, x));
}

function normalizeDecision(input: unknown, metFallback: unknown): GradeDecisionStatus | null {
  const raw = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (ALLOWED_DECISIONS.has(raw)) return raw as GradeDecisionStatus;
  if (raw === "NOTACHIEVED" || raw === "NOT-ACHIEVED") return "NOT_ACHIEVED";
  if (typeof metFallback === "boolean") return metFallback ? "ACHIEVED" : "NOT_ACHIEVED";
  return null;
}

function normalizeEvidence(input: any): GradeDecisionEvidence | null {
  if (!input || typeof input !== "object") return null;
  const page = Number(input.page);
  const quote = normalizeText(input.quote);
  const visualDescription = normalizeText(input.visualDescription);
  if (!Number.isInteger(page) || page <= 0) return null;
  if (!quote && !visualDescription) return null;
  return {
    page,
    ...(quote ? { quote } : {}),
    ...(visualDescription ? { visualDescription } : {}),
  };
}

export function validateGradeDecision(input: unknown, criteriaCodes: string[]): GradeDecisionValidationResult {
  const errors: string[] = [];
  const payload = (input && typeof input === "object" ? input : {}) as Record<string, any>;

  const grade = normalizeGrade(payload.overallGradeWord ?? payload.overallGrade);
  if (!grade) {
    errors.push(
      "overallGradeWord must be one of REFER/PASS/PASS_ON_RESUBMISSION/MERIT/DISTINCTION (FAIL accepted and normalized to REFER)."
    );
  }

  const feedbackSummary = normalizeText(payload.feedbackSummary);
  if (!feedbackSummary) errors.push("feedbackSummary is required.");

  const feedbackBulletsRaw = Array.isArray(payload.feedbackBullets) ? payload.feedbackBullets : [];
  const feedbackBullets = feedbackBulletsRaw
    .map((item: unknown) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 24);
  if (!feedbackBullets.length) errors.push("feedbackBullets must contain at least one non-empty bullet.");

  const resubmissionRequiredRaw = payload.resubmissionRequired;
  const resubmissionRequired =
    typeof resubmissionRequiredRaw === "boolean"
      ? resubmissionRequiredRaw
      : grade === "REFER";
  if (typeof resubmissionRequiredRaw !== "boolean" && typeof resubmissionRequiredRaw !== "undefined") {
    errors.push("resubmissionRequired must be boolean when provided.");
  }

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
    const decision = normalizeDecision(row?.decision, row?.met);
    const rationale = normalizeText(row?.rationale ?? row?.comment);
    const evidenceRaw = Array.isArray(row?.evidence) ? row.evidence : [];
    const evidence = evidenceRaw.map(normalizeEvidence).filter(Boolean) as GradeDecisionEvidence[];
    const rowConfidence = clamp01(row?.confidence);

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
    if (!decision) errors.push(`criterionChecks[${code}].decision is required and must be ACHIEVED/NOT_ACHIEVED/UNCLEAR.`);
    if (!rationale) errors.push(`criterionChecks[${code}].rationale is required.`);
    if (decision === "ACHIEVED" && (!Array.isArray(row?.evidence) || evidence.length === 0)) {
      errors.push(`criterionChecks[${code}] cannot be ACHIEVED without evidence.`);
    }
    if (!Number.isFinite(rowConfidence)) {
      errors.push(`criterionChecks[${code}].confidence must be a number between 0 and 1.`);
    }
    checks.push({
      code,
      decision: decision || "UNCLEAR",
      rationale,
      evidence,
      confidence: Number.isFinite(rowConfidence) ? rowConfidence : 0.5,
    });
  }

  for (const code of expectedCodes) {
    if (!seenCodes.has(code)) errors.push(`Missing criterion check for code: ${code}.`);
  }

  const confidence = clamp01(payload.confidence);
  if (!Number.isFinite(confidence)) errors.push("confidence must be a number between 0 and 1.");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      overallGradeWord: grade!,
      overallGrade: grade!,
      resubmissionRequired,
      feedbackSummary,
      feedbackBullets,
      criterionChecks: checks,
      confidence,
    },
  };
}
