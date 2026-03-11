function normalizeText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function ensureSentence(value: string) {
  const text = normalizeText(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function lowerFirst(value: string) {
  const text = normalizeText(value);
  if (!text) return "";
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function canonicalText(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCriterionCodes(codes: string[], max = 12) {
  const uniq = Array.from(
    new Set(
      (Array.isArray(codes) ? codes : [])
        .map((code) => String(code || "").trim().toUpperCase())
        .filter((code) => /^[PMD]\d{1,2}$/.test(code))
    )
  );
  if (!uniq.length) return "";
  if (uniq.length <= max) return uniq.join(", ");
  const shown = uniq.slice(0, Math.max(1, max));
  return `${shown.join(", ")} (+${uniq.length - shown.length} more)`;
}

export function isHigherGradeProgressionText(value: unknown) {
  const text = normalizeText(value);
  if (!text) return false;
  return /^(to (?:reach|achieve|secure|move from)|priority improvements:|merit gap to address:|distinction gap to address:|pass gap to address:|this submission is currently capped at pass)/i.test(
    text
  );
}

export function stripHigherGradeDuplicateBullets(input: {
  bullets: string[];
  higherGradeGuidance?: string | null;
  template?: string | null;
}) {
  const template = String(input.template || "");
  const hasSplitGuidance =
    template.includes("{feedbackBullets}") && template.includes("{higherGradeGuidance}");
  const guidanceKey = canonicalText(String(input.higherGradeGuidance || ""));
  const out: string[] = [];

  for (const raw of Array.isArray(input.bullets) ? input.bullets : []) {
    const text = normalizeText(raw);
    if (!text) continue;
    if (hasSplitGuidance && isHigherGradeProgressionText(text)) continue;
    const key = canonicalText(text);
    if (hasSplitGuidance && guidanceKey && key && (guidanceKey.includes(key) || key.includes(guidanceKey))) {
      continue;
    }
    out.push(text);
  }
  return out;
}

export function buildNaturalHigherGradeGuidance(input: {
  currentGrade: string;
  targetBand: "PASS" | "MERIT" | "DISTINCTION";
  missingCodes: string[];
  reasons?: string[];
  resubmissionCapped?: boolean;
}) {
  const currentGrade = String(input.currentGrade || "").trim().toUpperCase();
  const targetBand = String(input.targetBand || "").trim().toUpperCase() as "PASS" | "MERIT" | "DISTINCTION";
  const missingCodes = Array.isArray(input.missingCodes) ? input.missingCodes : [];
  const shown = formatCriterionCodes(missingCodes, 12);
  if (!shown) {
    if (targetBand === "DISTINCTION") return "Distinction criteria are met across the mapped brief scope.";
    return "Continue strengthening criterion-linked evidence to progress to higher bands.";
  }

  let intro = "";
  if (currentGrade === "MERIT" && targetBand === "DISTINCTION") {
    intro = `To move from MERIT to DISTINCTION, you still need to achieve ${shown}.`;
  } else if ((currentGrade === "PASS" || currentGrade === "PASS_ON_RESUBMISSION") && targetBand === "MERIT") {
    intro = `To move from PASS to MERIT, you still need to achieve ${shown}.`;
  } else if (currentGrade === "REFER" && targetBand === "PASS") {
    intro = `To secure PASS, you still need to achieve ${shown}.`;
  } else {
    intro = `To progress to ${targetBand}, you still need to achieve ${shown}.`;
  }

  const reasons = Array.from(
    new Set(
      (Array.isArray(input.reasons) ? input.reasons : [])
        .map((reason) => normalizeText(reason))
        .filter(Boolean)
    )
  ).slice(0, 2);

  const reasonText = reasons.length
    ? missingCodes.length === 1
      ? `At the moment, the gap is that ${lowerFirst(
          reasons[0].replace(new RegExp(`^${String(missingCodes[0] || "").trim().toUpperCase()}:?\\s*`, "i"), "")
        )}.`
      : `The main remaining gaps are: ${reasons.map((reason) => ensureSentence(reason)).join(" ")}`
    : "";

  const capText =
    input.resubmissionCapped && currentGrade === "PASS_ON_RESUBMISSION"
      ? "This work remains capped at PASS on resubmission policy until the reassessment conditions are met. "
      : "";

  return `${capText}${intro}${reasonText ? ` ${reasonText}` : ""}`.replace(/\s+/g, " ").trim();
}
