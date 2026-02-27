import { pdfToText } from "@/lib/extraction/text/pdfToText";

export type IvAdGrade = "Pass" | "Merit" | "Distinction" | "Fail";

export type IvAdExtractionPreview = {
  extractedText: string;
  pageCount: number;
  extractedGradeGuess: IvAdGrade | null;
  extractedKeyNotesGuess: string;
};

export type IvAdNarrative = {
  generalComments: string;
  actionRequired: string;
};

const ACTION_REQUIRED_LINE =
  "Assessor to acknowledge that their feedback needs improving by linking it clearly to LO1 (P1/P2/M1/D1) and confirming understanding of what is wrong in Task 2(b) and what is needed to correct it.";

function normalizeWhitespace(text: string) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normalizeGrade(value: unknown): IvAdGrade | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "distinction") return "Distinction";
  if (raw === "merit") return "Merit";
  if (raw === "pass") return "Pass";
  if (raw === "fail" || raw === "refer" || raw === "referral") return "Fail";
  return null;
}

export function guessGradeFromText(text: string): IvAdGrade | null {
  const src = normalizeWhitespace(text).toLowerCase();
  if (!src) return null;

  // Prioritize explicit "overall" phrasing if present.
  const explicitOverall =
    src.match(/\boverall\s+(?:grade|result|decision)?\s*[:\-]?\s*(distinction|merit|pass|fail|refer|referral)\b/i) ||
    src.match(/\boverall\s+(distinction|merit|pass|fail|refer|referral)\b/i);
  if (explicitOverall) return normalizeGrade(explicitOverall[1]);

  if (/\bdistinction\b/i.test(src)) return "Distinction";
  if (/\bmerit\b/i.test(src)) return "Merit";
  if (/\bpass\b/i.test(src)) return "Pass";
  if (/\b(?:fail|refer|referral)\b/i.test(src)) return "Fail";
  return null;
}

function sentenceWindowAround(text: string, anchorIndex: number) {
  const start = Math.max(0, anchorIndex - 180);
  const end = Math.min(text.length, anchorIndex + 220);
  return normalizeWhitespace(text.slice(start, end));
}

export function guessKeyNotesFromText(text: string): string {
  const src = normalizeWhitespace(text);
  if (!src) return "";

  const task2bIdx = src.search(/task\s*2\s*\(?b\)?/i);
  const hasGraphish = /\b(graph|chart|table|tables|charts)\b/i.test(src);
  const hasIncorrect = /\b(incorrect|wrong|error|errors|issue|issues|not\s+correct)\b/i.test(src);

  if (task2bIdx >= 0) {
    const window = sentenceWindowAround(src, task2bIdx);
    if (/\b(table|graph|chart|charts)\b/i.test(window) && /\b(incorrect|wrong|error|issue|not\s+correct)\b/i.test(window)) {
      return "Task 2(b) table/graph work is incorrect and needs correction.";
    }
    return "Task 2(b) requires clearer correction guidance in assessor feedback.";
  }

  if (hasGraphish && hasIncorrect) {
    return "Table/graph work contains issues and needs clearer correction steps.";
  }

  return "";
}

export async function extractIvAdPreviewFromMarkedPdfBuffer(buffer: Buffer): Promise<IvAdExtractionPreview> {
  try {
    const parsed = await pdfToText(buffer);
    const extractedText = normalizeWhitespace(parsed?.text || "");
    return {
      extractedText,
      pageCount: Math.max(0, Number(parsed?.pageCount || 0)),
      extractedGradeGuess: guessGradeFromText(extractedText),
      extractedKeyNotesGuess: guessKeyNotesFromText(extractedText),
    };
  } catch {
    return {
      extractedText: "",
      pageCount: 0,
      extractedGradeGuess: null,
      extractedKeyNotesGuess: "",
    };
  }
}

function criteriaSummaryForGrade(grade: IvAdGrade) {
  switch (grade) {
    case "Distinction":
      return {
        p: "Appears met overall from assessor decision and annotation trail.",
        m: "Appears met; assessor judgement is broadly consistent.",
        d: "Met (assessor awarded Distinction), but evidence links should still be explicit.",
      };
    case "Merit":
      return {
        p: "Appears met overall from the marked submission and assessor decision.",
        m: "Met (Merit awarded) based on assessor judgement shown in the script.",
        d: "Not met on current evidence/feedback trail.",
      };
    case "Pass":
      return {
        p: "Met (Pass awarded) based on assessor judgement shown in the script.",
        m: "Not met on current evidence/feedback trail.",
        d: "Not met on current evidence/feedback trail.",
      };
    case "Fail":
    default:
      return {
        p: "Not yet met / assessor has identified gaps requiring correction.",
        m: "Not met on current evidence/feedback trail.",
        d: "Not met on current evidence/feedback trail.",
      };
  }
}

export function buildIvAdNarrative(input: { finalGrade: IvAdGrade; keyNotes?: string | null }): IvAdNarrative {
  const grade = input.finalGrade;
  const keyNotes = String(input.keyNotes || "").trim();
  const criteria = criteriaSummaryForGrade(grade);
  const taskNote = keyNotes || "Task 2(b) issue is referenced, but correction guidance needs to be clearer.";

  const generalComments = [
    "Assessment decision check:",
    `- P1/P2: ${criteria.p}`,
    `- M1: ${criteria.m}`,
    `- D1: ${criteria.d}`,
    "",
    "Assessor feedback check:",
    `- Feedback notes ${taskNote} and confirms overall ${grade}, but needs clearer links to LO1 (P1/P2/M1/D1) and clear next steps.`,
    "",
    "Academic integrity:",
    "- No obvious plagiarism/collusion seen. Check Turnitin/AI declaration as standard.",
  ].join("\n");

  return {
    generalComments,
    actionRequired: ACTION_REQUIRED_LINE,
  };
}

export { ACTION_REQUIRED_LINE };

