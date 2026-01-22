import crypto from "crypto";

export type GradeBand = "PASS" | "MERIT" | "DISTINCTION";

export type SpecDraft = {
  kind: "SPEC";
  unit: {
    unitCode?: string;
    unitTitle?: string;
    specIssue?: string;
    specVersionLabel?: string;
  };
  learningOutcomes: Array<{
    loCode: string;
    description: string;
    essentialContent?: string;
    criteria: Array<{
      acCode: string;
      gradeBand: GradeBand;
      description: string;
    }>;
  }>;
  notes?: string[];
};

export type BriefDraft = {
  kind: "BRIEF";
  assignmentCode?: string;
  title?: string;
  unitCodeGuess?: string;
  assignmentNumber?: number;
  totalAssignments?: number;
  aiasLevel?: number;
  detectedCriterionCodes: string[];
  notes?: string[];
};

export type ExtractDraft = SpecDraft | BriefDraft;

// --- Text cleanup helpers ---

function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferBand(acCode: string): GradeBand {
  const c = acCode.trim().toUpperCase();
  if (c.startsWith("P")) return "PASS";
  if (c.startsWith("M")) return "MERIT";
  return "DISTINCTION";
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// --- SPEC parsing ---

/**
 * Heuristic parser for typical Pearson-ish unit spec formatting.
 * Goal is not perfection; goal is a draft that a human can approve quickly.
 */
export function parseSpecText(raw: string): SpecDraft {
  const notes: string[] = [];
  const text = normalizeText(raw);

  // Try to grab a spec issue/version label (best-effort)
  const issueMatch = text.match(/\bIssue\s*([0-9]{1,2})\b[^\n]{0,40}/i);
  const dateMatch = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i);
  const specIssue = issueMatch ? `Issue ${issueMatch[1]}` : undefined;
  const specVersionLabel = specIssue && dateMatch ? `${specIssue} – ${dateMatch[0]}` : dateMatch ? dateMatch[0] : specIssue;

  // Unit code guess (e.g. "Unit 4017" or "4017")
  let unitCode: string | undefined;
  const unitCodeMatch = text.match(/\bUnit\s+(\d{4})\b/i) || text.match(/\b(\d{4})\b/);
  if (unitCodeMatch) unitCode = unitCodeMatch[1];

  // Unit title guess: often near "Unit <code>" on the same line
  let unitTitle: string | undefined;
  const titleLineMatch = text.match(/\bUnit\s+\d{4}\s*[-:–]\s*([^\n]{3,120})/i);
  if (titleLineMatch) unitTitle = titleLineMatch[1].trim();

  // Split into LO blocks
  // Matches: "Learning Outcome 1" / "LO1" / "LO 1"
  const loRegex = /(?:\bLearning\s+Outcome\s*(\d+)\b|\bLO\s*(\d+)\b)/gi;

  const loHits: Array<{ lo: string; start: number; end?: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = loRegex.exec(text)) !== null) {
    const n = (m[1] || m[2] || "").trim();
    if (!n) continue;
    loHits.push({ lo: `LO${n}`, start: m.index });
  }


// De-duplicate LO hits: Pearson specs often repeat "LO1" in tables.
// Keep the first occurrence of each LO number to avoid phantom LOs (e.g. 12 instead of 4).
{
  const seen = new Set<string>();
  const deduped: Array<{ lo: string; start: number; end?: number }> = [];
  for (const h of loHits) {
    if (seen.has(h.lo)) continue;
    seen.add(h.lo);
    deduped.push(h);
  }
  if (deduped.length !== loHits.length) {
    notes.push(`De-duplicated LO headings (kept ${deduped.length}, removed ${loHits.length - deduped.length} repeats).`);
  }
  loHits.length = 0;
  loHits.push(...deduped);
}

  if (loHits.length === 0) {
    notes.push("No LO headings detected. This may be a scanned PDF (needs OCR) or unusual formatting.");
    return {
      kind: "SPEC",
      unit: { unitCode, unitTitle },
      learningOutcomes: [],
      notes,
    };
  }

  // Set end boundaries
  for (let i = 0; i < loHits.length; i++) {
    loHits[i].end = i + 1 < loHits.length ? loHits[i + 1].start : text.length;
  }

  const learningOutcomes: SpecDraft["learningOutcomes"] = [];

  for (const hit of loHits) {
    const block = text.slice(hit.start, hit.end);

// LO description: prefer same-line "LO1 <desc>" patterns; fall back to next non-empty line.
const lines = block.split("\n").map((x) => x.trim());
const headingIdx = lines.findIndex((l) => /\b(learning\s+outcome|\blo\s*\d+)\b/i.test(l));
const headingLine = headingIdx >= 0 ? lines[headingIdx] : "";
let desc = "";
// Try: "LO1 Examine ..." (common in Pearson specs)
const sameLine = headingLine.match(/\bLO\s*\d+\b\s*(.*)$/i);
if (sameLine && sameLine[1] && sameLine[1].trim().length > 6) {
  desc = sameLine[1].trim();
} else {
  desc = lines.slice(Math.max(0, headingIdx + 1)).find((l) => l.length > 6) || "";
}

    // Essential Content guess: take the paragraph chunk after the description,
    // excluding obvious criterion lines. This is intentionally conservative.
    const essentialLines: string[] = [];
    for (const l of lines.slice(headingIdx + 2)) {
      if (!l) continue;
      if (/^\b[PMD]\s*\d{1,2}\b/i.test(l)) continue;
      if (/\bassessment\s+criteria\b/i.test(l)) continue;
      if (/\blearning\s+outcomes\s+and\s+assessment\s+criteria\b/i.test(l)) break;
      essentialLines.push(l);
      if (essentialLines.join(" ").length > 1800) break;
    }
    const essentialContent = essentialLines.length ? essentialLines.join("\n") : undefined;

    // AC extraction within block: P1/M1/D1 patterns
    const acMatches = Array.from(block.matchAll(/\b([PMD])\s*([0-9]{1,2})\b/g));
    const codes = uniq(acMatches.map((x) => (x[1] + x[2]).toUpperCase()));

    const criteria: Array<{ acCode: string; gradeBand: GradeBand; description: string }> = [];

    // Try to capture criterion description on the same line after the code
    for (const code of codes) {
      const re = new RegExp(`\\b${code[0]}\\s*${code.slice(1)}\\b\\s*[:-–]?\\s*([^\\n]{10,250})`, "i");
      const mm = block.match(re);
      criteria.push({
        acCode: code,
        gradeBand: inferBand(code),
        description: (mm?.[1] || "").trim(),
      });
    }

    learningOutcomes.push({
      loCode: hit.lo,
      description: desc,
      essentialContent,
      criteria,
    });
  }

  // If we detected LOs but zero criteria, warn.
  const totalCriteria = learningOutcomes.reduce((n, lo) => n + lo.criteria.length, 0);
  if (totalCriteria === 0) {
    notes.push("LOs detected but no P/M/D criterion codes found. Formatting may be non-standard or scanned.");
  }

  return {
    kind: "SPEC",
    unit: { unitCode, unitTitle, specIssue, specVersionLabel },
    learningOutcomes,
    notes: notes.length ? notes : undefined,
  };
}

// --- BRIEF parsing ---

export function parseBriefText(raw: string, filenameHint?: string): BriefDraft {
  const notes: string[] = [];
  const text = normalizeText(raw);

// Assignment code: prefer explicit A1/A2 in text; fall back to filename; last resort: infer from "Assignment X of Y"
const assignmentCodeMatch =
  text.match(/\bA\s*([0-9]{1,2})\b/i) ||
  text.match(/\bA([0-9]{1,2})\b/i);

let assignmentCode: string | undefined = assignmentCodeMatch ? `A${assignmentCodeMatch[1]}` : undefined;

if (!assignmentCode && filenameHint) {
  const f = filenameHint.replace(/[_]+/g, " ");
  const fm =
    f.match(/\bA\s*([0-9]{1,2})\b/i) ||
    f.match(/\bA([0-9]{1,2})\b/i) ||
    f.match(/\bAssignment\s*([0-9]{1,2})\b/i);
  if (fm) assignmentCode = `A${fm[1]}`;
}

  const unitCodeGuessMatch = text.match(/\bUnit\s+(\d{4})\b/i) || text.match(/\b(\d{4})\b/);
  const unitCodeGuess = unitCodeGuessMatch ? unitCodeGuessMatch[1] : undefined;

  // Title guess: UniCourse templates often have "Assignment title" or "A... - Title" in header
  let title: string | undefined;
  const titleMatch = text.match(/\bAssignment\s+title\s*[:\-–]?\s*([^\n]{6,120})/i)
    || text.match(/\bA\s*\d{1,2}\s*[-:–]\s*([^\n]{6,120})/i);
  if (titleMatch) title = titleMatch[1].trim();

  // Assignment X of Y (common in your briefs)
  const numMatch = text.match(/\bAssignment\s*(\d+)\s*of\s*(\d+)\b/i);
  const assignmentNumber = numMatch ? Number(numMatch[1]) : undefined;
  const totalAssignments = numMatch ? Number(numMatch[2]) : undefined;

// If the brief doesn't explicitly contain "A1" etc (common in some templates),
// infer A{assignmentNumber} when "Assignment X of Y" is present.
if (!assignmentCode && assignmentNumber && assignmentNumber >= 1 && assignmentNumber <= 6) {
  assignmentCode = `A${assignmentNumber}`;
  notes.push(`Assignment code inferred from 'Assignment ${assignmentNumber} of ${totalAssignments ?? "?"}'. Please confirm.`);
}

  // AIAS level (if present)
  const aiasMatch = text.match(/\bAIAS\s*Level\s*(\d+)\b/i);
  const aiasLevel = aiasMatch ? Number(aiasMatch[1]) : undefined;

  // Prefer codes from the explicit "Relevant Learning Outcomes and Assessment Criteria" section if present
  const relevantIdx = text.toLowerCase().indexOf("relevant learning outcomes and assessment criteria");
  const scopeText = relevantIdx >= 0 ? text.slice(relevantIdx, relevantIdx + 2000) : text;
  const acMatches = Array.from(scopeText.matchAll(/\b([PMD])\s*([0-9]{1,2})\b/g));
  const detectedCriterionCodes = uniq(acMatches.map((x) => (x[1] + x[2]).toUpperCase())).sort();

  if (!assignmentCode) notes.push("Assignment code (A1/A2/…) not confidently detected.");
  if (detectedCriterionCodes.length === 0) notes.push("No P/M/D criterion codes detected in brief text.");

  return {
    kind: "BRIEF",
    assignmentCode,
    title,
    unitCodeGuess,
    assignmentNumber,
    totalAssignments,
    aiasLevel,
    detectedCriterionCodes,
    notes: notes.length ? notes : undefined,
  };
}
