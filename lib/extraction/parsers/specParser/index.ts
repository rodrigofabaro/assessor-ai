import { parseCriteriaByLO } from "./criteria";
import { extractEssentialContentByLO } from "./essential";

import { parseIssueLabel, parseMetaNumber, parsePearsonUnitCode, parseUnitCode, parseUnitTitle } from "./labels";
import { parseLearningOutcomes } from "./lo";
import type { ParsedSpec } from "./types";

export const SPEC_PARSER_VERSION = "spec-v1";

/**
 * Parse a Pearson Unit Descriptor PDF text into structured LOs + ACs.
 * Pure function: input text -> output JSON. No DB. No filesystem.
 */
export function parseSpec(text: string, docTitleFallback: string): ParsedSpec {
  const t = text || "";

  const issueLabel = parseIssueLabel(t);

  const unitCode = parseUnitCode(t, docTitleFallback);
  const unitTitle = parseUnitTitle(t, docTitleFallback);

  const pearsonUnitCode = parsePearsonUnitCode(t);
  const level = parseMetaNumber(t, "Level");
  const credits = parseMetaNumber(t, "Credits");

  // Learning outcomes
  const learningOutcomes = parseLearningOutcomes(t).map((lo) => ({
    ...lo,
    criteria: [],
  }));

  

// Criteria extraction (P/M/D)
const loCodes = learningOutcomes.map((x) => x.loCode);
const criteriaByLo = parseCriteriaByLO(t, loCodes);
for (const lo of learningOutcomes) {
  lo.criteria = criteriaByLo[lo.loCode] || [];
}

// Essential content (optional) — from Essential Content section only
const essentialByLo = extractEssentialContentByLO(t, loCodes);
for (const lo of learningOutcomes) {
  lo.essentialContent = essentialByLo[lo.loCode] || null;
}


  return {
    kind: "SPEC",
    parserVersion: SPEC_PARSER_VERSION,
    unit: {
      unitCode: unitCode || "",
      unitTitle: unitTitle || "",
      pearsonUnitCode: pearsonUnitCode || null,
      level: typeof level === "number" && !Number.isNaN(level) ? level : null,
      credits: typeof credits === "number" && !Number.isNaN(credits) ? credits : null,
      specIssue: issueLabel || null,
      specVersionLabel: issueLabel || null,
    },
    learningOutcomes,
  };
}
