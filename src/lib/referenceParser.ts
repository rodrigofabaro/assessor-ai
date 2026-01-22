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
    .replace(/\r/g, "\n")
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
 * Pearson unit specs repeat LO headings in multiple places (overview + LO/AC table).
 * We treat the LO/AC table as the source of truth for criteria mapping.
 */
function extractPearsonCriteriaByLo(fullText: string): Record<string, Array<{ acCode: string; gradeBand: GradeBand; description: string }>> {
  const t = normalizeText(fullText);

  // Best-effort: zoom into the LO/AC table area to reduce false matches.
  const anchor = "learning outcomes and assessment criteria";
  const idx = t.toLowerCase().indexOf(anchor);
  const tableText = idx >= 0 ? t.slice(idx, idx + 14000) : t;

  // Split by LO tokens while keeping the tokens.
  const parts = tableText.split(/\b(LO[1-4])\b/g);

  const byLo: Record<string, Array<{ acCode: string; gradeBand: GradeBand; description: string }>> = {};

  for (let i = 1; i < parts.length; i += 2) {
    const loCode = parts[i];
    const block = parts[i + 1] || "";

    // Capture "P1 <desc...>" (multiline) until next criterion or next LO.
    const critRegex = /\b([PMD]\d{1,2})\b\s*([^\n]+(?:\n(?!\s*(?:[PMD]\d{1,2}\b|LO[1-4]\b)).+)*)/g;

    const found: Array<{ acCode: string; gradeBand: GradeBand; description: string }> = [];
    let m: RegExpExecArray | null;

    while ((m = critRegex.exec(block)) !== null) {
      const acCode = m[1].toUpperCase().trim();
      const desc = normalizeText(m[2]).replace(/\n/g, " ").trim();
      if (desc.length < 10) continue;

      found.push({ acCode, gradeBand: inferBand(acCode), description: desc });
    }

    if (found.length) {
      // De-dupe by code; keep the longest description.
      const best: Record<string, (typeof found)[number]> = {};
      for (const c of found) {
        const prev = best[c.acCode];
        if (!prev || (c.description?.length || 0) > (prev.description?.length || 0)) best[c.acCode] = c;
      }
      byLo[loCode] = Object.values(best).sort((a, b) => a.acCode.localeCompare(b.acCode));
    }
  }

  return byLo;
}

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

  // Unit code guess (prefer "Unit 4017" style; avoid grabbing random years)
  let unitCode: string | undefined;
  const unitCodeMatch = text.match(/\bUnit\s+(\d{4})\b/i);
  if (unitCodeMatch) unitCode = unitCodeMatch[1];

  // Unit title guess: often near "Unit <code>" on the same line
  let unitTitle: string | undefined;
  const titleLineMatch = text.match(/\bUnit\s+\d{4}\s*[-:–]\s*([^\n]{3,140})/i);
  if (titleLineMatch) unitTitle = titleLineMatch[1].trim();

  // Find LO headings (we'll use these mainly to extract LO descriptions)
  const loRegex = /(?:\bLearning\s+Outcome\s*(\d+)\b|\bLO\s*(\d+)\b)/gi;
  const loHits: Array<{ lo: string; start: number; end?: number }> = [];
  let m: RegExpExecArray | null;

  while ((m = loRegex.exec(text)) !== null) {
    const n = (m[1] || m[2] || "").trim();
    if (!n) continue;
    const lo = `LO${n}`;
    // Keep the first occurrence for description purposes (Pearson repeats LOs in tables)
    if (loHits.some((x) => x.lo === lo)) continue;
    loHits.push({ lo, start: m.index });
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

  // Set end boundaries for LO description blocks
  for (let i = 0; i < loHits.length; i++) {
    loHits[i].end = i + 1 < loHits.length ? loHits[i + 1].start : text.length;
  }

  const learningOutcomes: SpecDraft["learningOutcomes"] = [];

  for (const hit of loHits) {
    const block = text.slice(hit.start, hit.end);

// LO description: include same-line text after "LOx", then add continuation lines.
const lines = block.split("\n").map((x) => x.trim());
const headingIdx = lines.findIndex((l) => /\b(learning\s+outcome|\blo\s*\d+)\b/i.test(l));
const headingLine = headingIdx >= 0 ? lines[headingIdx] : "";

// Grab same-line description: "LO2 Analyse cost effective..."
let headDesc = "";
const sameLine = headingLine.match(/\bLO\s*\d+\b\s*(.+)$/i);
if (sameLine && sameLine[1]) headDesc = sameLine[1].trim();

const startIdx = headingIdx >= 0 ? headingIdx + 1 : 0;

const tailLines: string[] = [];
for (const l of lines.slice(startIdx)) {
  if (!l) break;
  if (/\b[PMD]\s*\d{1,2}\b/i.test(l)) break;
  if (/\bpass\b|\bmerit\b|\bdistinction\b/i.test(l)) break;
  if (/\bassessment\s+criteria\b/i.test(l)) break;
  if (/\blearning\s+outcomes\s+and\s+assessment\s+criteria\b/i.test(l)) break;
  tailLines.push(l);
  if ((headDesc + " " + tailLines.join(" ")).length > 600) break;
}

const description = (headDesc + " " + tailLines.join(" "))
  .replace(/\s+/g, " ")
  .trim();


    // Essential Content guess: collect a conservative chunk after the description.
   const essentialLines: string[] = [];
const essentialStart = startIdx + tailLines.length;

for (const l of lines.slice(essentialStart)) {
  if (!l) continue;

  // stop/skip obvious table content
  if (/\bpass\b|\bmerit\b|\bdistinction\b/i.test(l)) continue;
  if (/^\b[PMD]\s*\d{1,2}\b/i.test(l)) continue;
  if (/\bassessment\s+criteria\b/i.test(l)) continue;
  if (/\blearning\s+outcomes\s+and\s+assessment\s+criteria\b/i.test(l)) break;
  if (/\bLO\s*\d+\b/i.test(l)) break; // stop if we accidentally drift into next LO section

  essentialLines.push(l);
  if (essentialLines.join(" ").length > 1800) break;
}

const essentialContent = essentialLines.length ? essentialLines.join("\n") : undefined;

    learningOutcomes.push({
      loCode: hit.lo,
      description,
      essentialContent,
      criteria: [],
    });
  }

  // Attach criteria from Pearson LO/AC table (authoritative for mapping)
  const criteriaByLo = extractPearsonCriteriaByLo(text);
  let mappedCount = 0;

  for (const lo of learningOutcomes) {
    const mapped = criteriaByLo[lo.loCode];
    if (mapped?.length) {
      lo.criteria = mapped;
      mappedCount += mapped.length;
    }
  }

  if (mappedCount === 0) {
    notes.push("LOs detected but no P/M/D criterion statements found in the LO/AC table region. Formatting may be non-standard or scanned.");
  } else {
    const empty = learningOutcomes.filter((lo) => !lo.criteria?.length).map((lo) => lo.loCode);
    if (empty.length) notes.push(`Some LOs have no criteria mapped: ${empty.join(", ")}.`);
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

  // Unit code guess: briefs often contain "Unit number and title 4017 ..."
  // Avoid accidentally picking a "linked unit" (e.g., "This unit links to 5016...").
  const linksIdx = text.toLowerCase().indexOf("links to the following related units");
  const headText = linksIdx >= 0 ? text.slice(0, linksIdx) : text;

  const unitCodeGuessMatch =
    headText.match(/\bUnit\s+number\s+and\s+title\s*[:\-–]?\s*(\d{4})\b/i) ||
    headText.match(/\bUnit\s+(\d{4})\b/i);

  const unitCodeGuess = unitCodeGuessMatch ? unitCodeGuessMatch[1] : undefined;

  // Title guess: UniCourse templates often have "Assignment title" or "A... - Title" in header
  let title: string | undefined;
  const titleMatch =
    text.match(/\bAssignment\s+title\s*[:\-–]?\s*([^\n]{6,160})/i) ||
    text.match(/\bA\s*\d{1,2}\s*[-:–]\s*([^\n]{6,160})/i);
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
  const scopeText = relevantIdx >= 0 ? text.slice(relevantIdx, relevantIdx + 2500) : text;

  const acMatches = Array.from(scopeText.matchAll(/\b([PMD])\s*([0-9]{1,2})\b/g));
  const detectedCriterionCodes = uniq(acMatches.map((x) => (x[1] + x[2]).toUpperCase())).sort();

  if (!assignmentCode) notes.push("Assignment code (A1/A2/…) not confidently detected.");
  if (!unitCodeGuess) notes.push("Unit code not confidently detected (please link the brief to a locked unit).");
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
