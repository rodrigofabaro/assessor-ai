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
  const t = text || "";

  // Unit number and title 4015 ...
  const unitCodeGuess =
    t.match(/\bUnit\s+number\s+and\s+title\s+(4\d{3})\b/i)?.[1] ??
    t.match(/\bUnit\s+(4\d{3})\b/i)?.[1] ??
    t.match(/\b(4\d{3})\b/)?.[1] ??
    null;

  // Assignment 1 of 2
  const assMatch = t.match(/\bAssignment\s+(\d+)\s+of\s+(\d+)\b/i);
  const assignmentNumber = assMatch?.[1] ? Number(assMatch[1]) : null;
  const totalAssignments = assMatch?.[2] ? Number(assMatch[2]) : null;

  // Prefer derived assignment code
  const assignmentCodeGuess =
    assignmentNumber ? `A${assignmentNumber}` :
    t.match(/\bA\d+\b/i)?.[0]?.toUpperCase() ?? null;

  // Assignment title (if present as a field)
  const title =
    t.match(/\bAssignment\s+title\s*[:\-]?\s*([^\n\r]+)\b/i)?.[1]?.trim() ??
    null;

  // AIAS – LEVEL 1
  const aiasLevel = Number(t.match(/\bAIAS\s*[–-]\s*LEVEL\s*(\d)\b/i)?.[1] ?? "") || null;

  // Criteria codes (P/M/D)
  const codeMatches = Array.from(
    t.toUpperCase().matchAll(/\b([PMD])\s*(\d{1,2})\b/g)
  ).map((m) => `${m[1]}${m[2]}`);

  const detectedCriterionCodes = Array.from(new Set(codeMatches));

  return {
    kind: "BRIEF",
    rawText: text,
    notes: ["parseBriefText: structured draft"],
    title,
    assignmentCode: assignmentCodeGuess,
    unitCodeGuess,
    detectedCriterionCodes,
    assignmentNumber,
    totalAssignments,
    aiasLevel,
  };
}
