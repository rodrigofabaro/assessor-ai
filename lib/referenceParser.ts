// webapp/lib/referenceParser.ts

export type GradeBand = "PASS" | "MERIT" | "DISTINCTION";

export type CriterionDraft = {
  acCode: string;
  description: string;
  gradeBand?: GradeBand;
};

export type LearningOutcomeDraft = {
  loCode: string;
  description: string;
  essentialContent?: string | null;
  criteria: CriterionDraft[];
};

export type SpecDraft = {
  kind: "SPEC";
  rawText: string;
  notes?: string[];
  unit: {
    unitCode: string;
    unitTitle: string;
    specIssue?: string | null;
    specVersionLabel?: string | null;
  };
  learningOutcomes: LearningOutcomeDraft[];
};

export type BriefDraft = {
  kind: "BRIEF";
  rawText: string;
  notes?: string[];
  title?: string | null;
  assignmentCode?: string | null;
  unitCodeGuess?: string | null;
  detectedCriterionCodes?: string[];
  assignmentNumber?: number | null;
  totalAssignments?: number | null;
  aiasLevel?: number | null;
};

export type ExtractDraft = SpecDraft | BriefDraft;

export function parseSpecText(text: string): SpecDraft {
  const unitCodeGuess = text.match(/\b(4\d{3})\b/)?.[1] ?? "";
  return {
    kind: "SPEC",
    rawText: text,
    notes: ["parseSpecText: minimal draft (structure placeholders)"],
    unit: {
      unitCode: unitCodeGuess,
      unitTitle: "",
      specIssue: null,
      specVersionLabel: null,
    },
    learningOutcomes: [],
  };
}

export function parseBriefText(text: string): BriefDraft {
  const assignmentCodeGuess =
    text.match(/\bA\d+\b/i)?.[0]?.toUpperCase() ?? null;

  const unitCodeGuess = text.match(/\b(4\d{3})\b/)?.[1] ?? null;

  // super lightweight code detection (P1/M1/D1 etc.)
  const codeMatches = Array.from(
    text.toUpperCase().matchAll(/\b([PMD]\s?\d{1,2})\b/g)
  ).map((m) => (m[1] ?? "").replace(/\s+/g, ""));

  const detectedCriterionCodes = Array.from(new Set(codeMatches));

  return {
    kind: "BRIEF",
    rawText: text,
    notes: ["parseBriefText: minimal draft (structure placeholders)"],
    title: null,
    assignmentCode: assignmentCodeGuess,
    unitCodeGuess,
    detectedCriterionCodes,
    assignmentNumber: null,
    totalAssignments: null,
    aiasLevel: null,
  };
}
