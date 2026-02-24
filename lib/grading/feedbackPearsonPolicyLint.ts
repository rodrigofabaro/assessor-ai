type EvidenceLite = {
  quote?: string | null;
  visualDescription?: string | null;
};

type CriterionCheckLite = {
  code?: string | null;
  decision?: string | null;
  rationale?: string | null;
  comment?: string | null;
  evidence?: EvidenceLite[] | null;
};

type PearsonFeedbackLintContext = {
  unitCode?: string | null;
  assignmentCode?: string | null;
  assignmentTitle?: string | null;
};

const GLOBAL_TEMPLATE_LEAK_TERMS = [
  "renewable",
  "solar",
  "pv",
  "wind",
  "hydro",
  "geothermal",
  "lcoe",
  "converter",
  "smart grid",
  "simulink",
  "matlab",
  "geogebra",
  "desmos",
  "phasor",
  "sinusoidal",
  "compound-angle",
  "waveform",
  "determinant",
  "vector component",
  "telos",
  "risk register",
  "critical path",
  "cpm",
  "rag status",
  "milestone tracker",
  "gantt chart",
] as const;

function normalizeText(value: unknown) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isDeterministicOutcomeLine(line: string) {
  const src = String(line || "").trim();
  if (!src) return false;
  return /^(To reach\s+[A-Z]+,|Criteria achieved:|Criteria still to evidence clearly:|Why these are still open:|Learning outcomes\s|Final grade:)/i.test(
    src
  );
}

function hasCaveatLanguage(line: string) {
  return /\b(however|but|could|can be|not fully|still open|still to|partially|to reach|gap)\b/i.test(String(line || ""));
}

function buildSourceCorpus(input: { criterionChecks?: CriterionCheckLite[]; context?: PearsonFeedbackLintContext | null }) {
  const bits: string[] = [];
  for (const row of Array.isArray(input.criterionChecks) ? input.criterionChecks : []) {
    bits.push(String(row?.rationale || row?.comment || ""));
    for (const ev of Array.isArray(row?.evidence) ? row.evidence : []) {
      bits.push(String(ev?.quote || ""));
      bits.push(String(ev?.visualDescription || ""));
    }
  }
  bits.push(String(input.context?.assignmentTitle || ""));
  bits.push(String(input.context?.unitCode || ""));
  bits.push(String(input.context?.assignmentCode || ""));
  return normalizeText(bits.join(" ")).toLowerCase();
}

function softenGradeToneLine(line: string, overallGrade?: string | null) {
  let next = String(line || "");
  if (!next.trim() || isDeterministicOutcomeLine(next)) return { line: next, changed: false };
  const before = next;
  const grade = String(overallGrade || "").trim().toUpperCase();
  const hasCaveat = hasCaveatLanguage(next);

  if (!hasCaveat && (grade === "PASS" || grade === "PASS_ON_RESUBMISSION")) {
    next = next
      .replace(/\b(outstanding|exceptional|exemplary)\b/gi, "strong")
      .replace(/\bflawless\b/gi, "clear")
      .replace(/\bperfect\b/gi, "well-structured")
      .replace(/\bexcellent\b/gi, "clear");
  } else if (!hasCaveat && grade === "MERIT") {
    next = next
      .replace(/\b(outstanding|exceptional|exemplary)\b/gi, "strong")
      .replace(/\bflawless\b/gi, "well-developed")
      .replace(/\bperfect\b/gi, "well-developed");
  }
  return { line: next, changed: next !== before };
}

function softenPersonJudgementLine(line: string) {
  let next = String(line || "");
  if (!next.trim() || isDeterministicOutcomeLine(next)) return { line: next, changed: false };
  const before = next;
  next = next
    .replace(/\b[Yy]ou are an? (excellent|outstanding|strong) student\b/g, "Your work shows $1 progress")
    .replace(/\b[Yy]ou are (excellent|outstanding|strong)\b/g, "Your work is $1")
    .replace(/\b[Yy]ou are (weak|poor|careless|lazy)\b/g, "The current submission is")
    .replace(/\b[Yy]ou failed to\b/g, "The current submission does not yet")
    .replace(/\b[Yy]our ability\b/g, "The work");

  return { line: next, changed: next !== before };
}

function normalizeCommandVerbPhrasing(line: string) {
  let next = String(line || "");
  if (!next.trim() || isDeterministicOutcomeLine(next)) return { line: next, changed: false };
  const before = next;
  next = next
    .replace(/\btalk about\b/gi, "explain")
    .replace(/\bsay why\b/gi, "justify why")
    .replace(/\bgive your opinion\b/gi, "evaluate")
    .replace(/\bshow your opinion\b/gi, "evaluate")
    .replace(/\bdescribe pros and cons\b/gi, "evaluate advantages and limitations");
  return { line: next, changed: next !== before };
}

function replaceOutOfContextLeakTerms(line: string, sourceCorpus: string) {
  let next = String(line || "");
  if (!next.trim() || isDeterministicOutcomeLine(next)) return { line: next, changed: false };
  const before = next;
  const replacements: Array<[RegExp, string, string[]]> = [
    [/\b(solar|pv|wind|hydro|geothermal|renewable|lcoe|smart grid)\b/gi, "subject-specific", ["solar", "pv", "wind", "hydro", "geothermal", "renewable", "lcoe", "smart grid"]],
    [/\b(simulink|matlab|geogebra|desmos)\b/gi, "software tool", ["simulink", "matlab", "geogebra", "desmos"]],
    [/\b(phasor|sinusoidal|compound-angle|waveform|determinant|vector component)\b/gi, "technical method", ["phasor", "sinusoidal", "compound-angle", "waveform", "determinant", "vector component"]],
    [/\b(telos|risk register|critical path|cpm|rag status|milestone tracker|gantt chart)\b/gi, "planning/monitoring evidence", ["telos", "risk register", "critical path", "cpm", "rag status", "milestone tracker", "gantt chart"]],
  ];

  for (const [pattern, replacement, terms] of replacements) {
    const shouldAllow = terms.some((t) => sourceCorpus.includes(t));
    if (shouldAllow) continue;
    next = next.replace(pattern, replacement);
  }

  if (!sourceCorpus) {
    // Fall back to a stricter pass if we have no evidence corpus context.
    for (const term of GLOBAL_TEMPLATE_LEAK_TERMS) {
      const re = new RegExp(`\\b${String(term).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "gi");
      next = next.replace(re, "subject-specific");
    }
  }

  next = next.replace(/\bsubject-specific(?:\s+subject-specific)+\b/gi, "subject-specific");
  next = next.replace(/\bsoftware tool(?:\s+software tool)+\b/gi, "software tool");
  next = next.replace(/\bplanning\/monitoring evidence(?:\s+planning\/monitoring evidence)+\b/gi, "planning/monitoring evidence");
  next = next.replace(/\btechnical method(?:\s+technical method)+\b/gi, "technical method");
  return { line: next, changed: next !== before };
}

export function lintOverallFeedbackPearsonPolicy(input: {
  text: string;
  overallGrade?: string | null;
  criterionChecks?: CriterionCheckLite[] | null;
  context?: PearsonFeedbackLintContext | null;
}) {
  const text = normalizeText(input.text);
  if (!text.trim()) return { text, changed: false, changedLines: 0 };
  const sourceCorpus = buildSourceCorpus({ criterionChecks: input.criterionChecks || [], context: input.context || null });

  let changedLines = 0;
  const lines = text.split("\n").map((line) => {
    let next = line;
    const leakGuard = replaceOutOfContextLeakTerms(next, sourceCorpus);
    next = leakGuard.line;
    if (leakGuard.changed) changedLines += 1;

    const tone = softenGradeToneLine(next, input.overallGrade);
    next = tone.line;
    if (tone.changed) changedLines += 1;

    const workFocus = softenPersonJudgementLine(next);
    next = workFocus.line;
    if (workFocus.changed) changedLines += 1;

    const verbs = normalizeCommandVerbPhrasing(next);
    next = verbs.line;
    if (verbs.changed) changedLines += 1;

    return next;
  });

  return {
    text: lines.join("\n"),
    changed: changedLines > 0,
    changedLines,
  };
}

