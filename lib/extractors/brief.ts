import { firstMatch, normalizeWhitespace } from "./common";
import { extractCriteriaCodesFromText } from "../extraction/utils/criteriaCodes";

/**
 * BRIEF extractor
 * - Keeps the existing "brief core" extraction (unit guess, assignment number, criteria codes, etc.)
 * - Adds a conservative header snapshot extractor used for audit/version control.
 */

type BriefHeader = {
  qualification?: string | null;
  unitNumberAndTitle?: string | null;
  assignmentTitle?: string | null;
  assignment?: string | null;
  assessor?: string | null;
  unitCode?: string | null;
  internalVerifier?: string | null;
  verificationDate?: string | null;
  verificationDateIso?: string | null;
  issueDate?: string | null;
  issueDateIso?: string | null;
  finalSubmissionDate?: string | null;
  finalSubmissionDateIso?: string | null;
  academicYear?: string | null;
  warnings?: string[];
};

type BriefTask = {
  n: number;
  label: string;
  title?: string | null;
  aias?: string | null;
  pages?: number[];
  text: string;
  prompt?: string;
  parts?: Array<{ key: string; text: string }>;
  warnings?: string[];
  confidence?: "CLEAN" | "HEURISTIC";
  scenarioText?: string | null;
};

type BriefScenario = {
  text: string;
  pages?: number[];
  appliesToTask?: number;
};

export type BriefEquation = {
  id: string;
  pageNumber: number;
  bbox: { x: number; y: number; w: number; h: number };
  latex: string | null;
  confidence: number;
  needsReview: boolean;
  latexSource: "heuristic" | "manual" | null;
};

function normHeader(s: string) {
  return (s || "")
    .replace(/\r/g, "")
    // join ordinal breaks like "1\nst\n September"
    .replace(/(\d{1,2})\s*\n\s*(st|nd|rd|th)\s*\n\s*/gi, "$1$2 ")
    // normalize newlines to spaces for header parsing
    .replace(/\n+/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function academicYearLike(s: string) {
  const v = (s || "").trim();
  if (!v) return false;
  if (/\b(unit|code|assignment|verifier|date)\b/i.test(v)) return false;
  if (/^\d{1,2}$/.test(v)) return true;
  if (/^\d{4}\s*\/\s*\d{2}$/.test(v)) return true; // 2025/26
  if (/^\d{4}\s*[-/]\s*\d{2,4}$/.test(v)) return true;
  if (/^\d{4}$/.test(v)) return true;
  return false;
}

function tidyDate(s: string) {
  const v = normHeader(s);
  return v.replace(/(\d{1,2})\s*(st|nd|rd|th)\b/gi, "$1$2");
}

function parseDateIso(s: string | null | undefined): string | null {
  const v = tidyDate(s || "");
  if (!v) return null;
  const m = v.match(/(\d{1,2})(st|nd|rd|th)?\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (!m) return null;
  const day = String(parseInt(m[1], 10)).padStart(2, "0");
  const monthName = m[3].toLowerCase();
  const monthMap: Record<string, string> = {
    january: "01",
    jan: "01",
    february: "02",
    feb: "02",
    march: "03",
    mar: "03",
    april: "04",
    apr: "04",
    may: "05",
    june: "06",
    jun: "06",
    july: "07",
    jul: "07",
    august: "08",
    aug: "08",
    september: "09",
    sep: "09",
    sept: "09",
    october: "10",
    oct: "10",
    november: "11",
    nov: "11",
    december: "12",
    dec: "12",
  };
  const month = monthMap[monthName];
  if (!month) return null;
  return `${m[4]}-${month}-${day}`;
}

function dateLike(s: string) {
  const v = tidyDate(s);
  if (!v) return false;
  if (/^\d{1,2}$/.test(v)) return false;
  if (/^\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,}\s+\d{4}$/.test(v)) return true;
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(v)) return true;
  if (/no later than\s+\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,}\s+\d{4}/i.test(v))
    return true;
  return false;
}

const LABELS = [
  "Qualification",
  "Unit number and title",
  "Assignment title",
  "Assignment",
  "Assignment number",
  "Unit Code",
  "Assessor",
  "Internal Verifier",
  "Verification Date",
  "Issue Date",
  "Final Submission Date",
  "Academic year",
];

function splitLines(text: string) {
  return (text || "").replace(/\r/g, "").split("\n");
}

function startsWithLowerish(line: string) {
  return /^[("'“”‘’\(\[]?[a-z]/.test(line);
}

function isListMarkerLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^[•\-\–\*]\s+/.test(trimmed)) return true;
  if (/^[a-z]\)\s+/i.test(trimmed)) return true;
  if (/^\d+(\.\d+)*[.)]\s+/.test(trimmed)) return true;
  if (/^[ivxlcdm]+[.)]\s+/i.test(trimmed)) return true;
  return false;
}

function isHeadingLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length > 60) return false;
  if (/[.]/.test(trimmed)) return false;
  if (startsWithLowerish(trimmed)) return false;
  return true;
}

function reflowProsePreserveLists(text: string) {
  const lines = splitLines(text);
  const output: string[] = [];
  let currentLine = "";

  const flush = () => {
    if (currentLine) output.push(currentLine);
    currentLine = "";
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flush();
      if (output.length === 0 || output[output.length - 1] !== "") output.push("");
      continue;
    }

    if (isListMarkerLine(trimmed) || isHeadingLine(trimmed)) {
      flush();
      output.push(trimmed);
      continue;
    }

    if (!currentLine) {
      currentLine = trimmed;
      continue;
    }

    const endsWithTerminal = /[.?!:]$/.test(currentLine);
    const endsWithComma = /,$/.test(currentLine);
    const shouldJoin = !endsWithTerminal && (endsWithComma || startsWithLowerish(trimmed));
    if (shouldJoin) {
      currentLine = `${currentLine} ${trimmed}`;
    } else {
      output.push(currentLine);
      currentLine = trimmed;
    }
  }

  flush();
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isNumericOrCurrencyToken(token: string) {
  const normalized = (token || "").trim();
  if (!normalized) return false;
  return /^£$/.test(normalized) || /^(?:[<>]=?\s*)?[-+]?\d[\d,.]*%?$/.test(normalized);
}

function isTableCaptionLine(line: string) {
  return /^table\s+\d+(?:\.\d+)?\b/i.test((line || "").trim());
}

function isCostingHeaderLine(line: string) {
  return /^month\b/i.test((line || "").trim());
}

function isTableHeaderLikeLine(line: string) {
  const normalized = normalizeWhitespace(line || "").toLowerCase();
  if (!normalized) return false;
  if (/(output\s+voltage|number\s+of\s+drivers|before\s+qc|after\s+qc|month\s+before\s+qc\s+after\s+qc)/i.test(normalized)) {
    return true;
  }
  return false;
}

function isNumericTailRow(line: string) {
  const tokens = (line || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return false;
  const last = tokens[tokens.length - 1];
  const secondLast = tokens[tokens.length - 2];
  return isNumericOrCurrencyToken(secondLast) && isNumericOrCurrencyToken(last);
}

function detectTableLineSpans(lines: string[]) {
  const spans: Array<{ start: number; end: number }> = [];

  const addSpan = (start: number, end: number) => {
    if (start >= end) return;
    const previous = spans[spans.length - 1];
    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
      return;
    }
    spans.push({ start, end });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const costingLookahead = lines
      .slice(i, Math.min(lines.length, i + 4))
      .map((line) => normalizeWhitespace(line).toLowerCase())
      .join(" ");
    const startsCostingTable = isCostingHeaderLine(trimmed) && /before\s+qc/.test(costingLookahead) && /after\s+qc/.test(costingLookahead);

    const startsTable =
      isTableCaptionLine(trimmed) ||
      startsCostingTable ||
      (isTableHeaderLikeLine(trimmed) && i + 1 < lines.length && isNumericTailRow(lines[i + 1])) ||
      isNumericTailRow(trimmed);

    if (!startsTable) continue;

    let start = i;
    if (start > 0) {
      const prev = lines[start - 1].trim();
      if (isTableCaptionLine(prev)) start -= 1;
    }

    let end = i + 1;
    while (end < lines.length) {
      const next = lines[end].trim();
      if (!next) break;
      end += 1;
    }

    if (end - start >= 2) {
      addSpan(start, end);
      i = end - 1;
    }
  }

  return spans;
}

function reflowPreservingTables(text: string) {
  const lines = splitLines(text);
  const spans = detectTableLineSpans(lines);
  if (!spans.length) return reflowProsePreserveLists(text);

  const output: string[] = [];
  let cursor = 0;

  for (const span of spans) {
    const proseChunk = lines.slice(cursor, span.start).join("\n");
    if (proseChunk.trim()) output.push(reflowProsePreserveLists(proseChunk));

    const tableChunk = lines.slice(span.start, span.end).join("\n").trimEnd();
    if (tableChunk) output.push(tableChunk);
    cursor = span.end;
  }

  const remainder = lines.slice(cursor).join("\n");
  if (remainder.trim()) output.push(reflowProsePreserveLists(remainder));
  return output.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeLabel(label: string) {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLabelLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return LABELS.some((label) => new RegExp(`^${escapeLabel(label)}\\b`, "i").test(trimmed));
}

function extractByLabelLines(lines: string[], label: string) {
  const labelRegex = new RegExp(`^\\s*${escapeLabel(label)}\\b\\s*[:\\-–]?\\s*(.*)$`, "i");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(labelRegex);
    if (!match) continue;

    const remainder = (match[1] || "").trim();
    if (remainder) {
      return normalizeWhitespace(remainder).slice(0, 200);
    }

    const collected: string[] = [];
    for (let j = i + 1; j < lines.length && collected.length < 4; j += 1) {
      const nextLine = lines[j];
      if (isLabelLine(nextLine)) break;
      if (!nextLine.trim() && collected.length === 0) continue;
      if (nextLine.trim()) collected.push(nextLine.trim());
      if (collected.join(" ").length > 200) break;
    }

    const raw = normalizeWhitespace(collected.join(" "));
    return raw ? raw.slice(0, 200) : null;
  }
  return null;
}

const FOOTER_PATTERNS = [
  /©\s*\d{4}\s*unicourse.*all rights reserved/i,
  /\bissue\s*\d+\s*[-–]?\s*\d{4}\s*\/\s*\d{2}\b/i,
  /\bpage\s*\d+\s*of\s*\d+\b/i,
  /\bissue\s*\d+\s*[-–]?\s*\d{4}\s*\/\s*\d{2}\s*page\s*\d+\s*of\s*\d+\b/i,
];

function isFooterLine(line: string) {
  const normalized = normalizeWhitespace(line).toLowerCase();
  if (!normalized) return false;
  return FOOTER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function stripFooterLines(lines: string[]) {
  return lines.filter((line) => !isFooterLine(line));
}

type EndMatterKey = "sourcesBlock" | "criteriaBlock";

const PRIMARY_END_MATTER: Array<{ key: EndMatterKey; regex: RegExp }> = [
  { key: "sourcesBlock", regex: /\bsources\s+of\s+information\b/i },
  { key: "criteriaBlock", regex: /\brelevant\s+learning\s+outcomes\s+and\s+assessment\s+criteria\b/i },
];

const SECONDARY_END_MATTER: Array<{ key: EndMatterKey; regex: RegExp }> = [
  { key: "sourcesBlock", regex: /\btextbooks?\b/i },
  { key: "sourcesBlock", regex: /\bwebsites?\b/i },
  { key: "sourcesBlock", regex: /\bfurther\s+reading\b/i },
  { key: "sourcesBlock", regex: /\badditional\s+resources?\b/i },
  { key: "criteriaBlock", regex: /\bassessment\s+criteria\b/i },
  { key: "criteriaBlock", regex: /\bpass\s+merit\s+distinction\b/i },
];

const END_MATTER_ANCHOR_WINDOW = 6;

function normalizeHeadingCandidate(text: string) {
  return normalizeWhitespace(text || "").toLowerCase();
}

function isHeadingLike(line: string) {
  const trimmed = normalizeHeadingCandidate(line);
  if (!trimmed) return false;
  if (trimmed.length > 70) return false;
  return !/[.!?]/.test(trimmed);
}

function extractAiasLevelsFromText(text: string) {
  const levels: number[] = [];
  const aiasMatches = text.matchAll(/\bAIAS\s*(?:[–-]\s*LEVEL\s*)?\(?\s*(\d)\s*\)?\b/gi);
  for (const match of aiasMatches) {
    const value = Number(match[1]);
    if (!Number.isNaN(value)) levels.push(value);
  }
  const scaleMatches = text.matchAll(/\bAI\s*Assessment\s*Scale\b[\s\S]{0,40}?\bLevel\s*(\d)\b/gi);
  for (const match of scaleMatches) {
    const value = Number(match[1]);
    if (!Number.isNaN(value)) levels.push(value);
  }
  return levels;
}

function extractAiasValue(text: string) {
  const levels = extractAiasLevelsFromText(text);
  return levels.length ? `AIAS ${Math.min(...levels)}` : null;
}

function getPrimaryEndMatterKeyFromWindow(lines: string[], startIndex: number, windowSize = 6) {
  for (let size = 0; size < windowSize; size += 1) {
    const windowLines = lines.slice(startIndex, startIndex + size + 1);
    const window = windowLines
      .map((line) => normalizeHeadingCandidate(line))
      .filter(Boolean)
      .join(" ");
    if (!window) continue;
    const hit = PRIMARY_END_MATTER.find(({ regex }) => regex.test(window));
    if (hit) {
      const headingLike = windowLines.some((line) => isHeadingLike(line));
      if (headingLike) return hit.key;
    }
  }
  return null;
}

function getSecondaryEndMatterKey(line: string) {
  const trimmed = normalizeHeadingCandidate(line);
  if (!trimmed) return null;
  return SECONDARY_END_MATTER.find(({ regex }) => regex.test(trimmed))?.key || null;
}

function extractEndMatterBlocks(pages: string[]) {
  const blocks: Record<string, string[]> = {};
  let currentKey: EndMatterKey | null = null;
  let lastPrimaryIndex = -999;

  pages.forEach((pageText) => {
    const lines = splitLines(pageText);
    lines.forEach((line, idx) => {
      const primaryKey = getPrimaryEndMatterKeyFromWindow(lines, idx);
      if (primaryKey) {
        currentKey = primaryKey;
        lastPrimaryIndex = idx;
        if (!blocks[currentKey]) blocks[currentKey] = [];
      } else {
        const secondaryKey = getSecondaryEndMatterKey(line);
        if (secondaryKey) {
          const withinWindow = idx - lastPrimaryIndex <= END_MATTER_ANCHOR_WINDOW;
          const headingLike = isHeadingLike(line);
          if (currentKey === "sourcesBlock" || withinWindow || headingLike) {
            currentKey = secondaryKey;
            if (!blocks[currentKey]) blocks[currentKey] = [];
          }
        }
      }

      if (currentKey) blocks[currentKey].push(line);
    });
  });

  const sourcesBlock = blocks.sourcesBlock?.join("\n").trim() || null;
  const criteriaBlock = blocks.criteriaBlock?.join("\n").trim() || null;
  if (!sourcesBlock && !criteriaBlock) return null;
  return { sourcesBlock, criteriaBlock };
}

function splitPages(text: string): string[] {
  const cleaned = (text || "").replace(/\r/g, "");
  const parts = cleaned.split(/\f|\u000c/);
  if (parts.length <= 1) return [cleaned];
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function extractByPattern(preview: string, pattern: RegExp) {
  const m = preview.match(pattern);
  return m?.[1] ? normalizeWhitespace(m[1]) : null;
}

function extractAcademicYearFallback(preview: string): string | null {
  const t = normHeader(preview);

  // Prefer "Issue X - 2025/26" as the academic year/cycle signal (more reliable than the table's "Academic year 1").
  const m = t.match(/\bIssue\s+\d+\s*-\s*(\d{4}\s*\/\s*\d{2,4})\b/i);
  if (m?.[1]) {
    const yr = m[1].replace(/\s*/g, "");
    // normalise 2025/2026 -> 2025/26
    const yrNorm = yr.replace(/^(.{4})\/(\d{4})$/, (_m, a, b) => `${a}/${String(b).slice(-2)}`);
    return academicYearLike(yrNorm) ? yrNorm : null;
  }

  // Fallback: infer from issue date month (Sep-Dec => year/year+1)
  const d = t.match(
    /\bIssue Date\s+(\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,}\s+\d{4})\b/i
  );
  if (d?.[1]) {
    const year = parseInt(d[1].match(/\d{4}/)![0], 10);
    const month = d[1]
      .toLowerCase()
      .match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/)?.[1];
    if (month && ["sep", "oct", "nov", "dec"].includes(month)) {
      return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
    }
  }

  return null;
}

export function extractBriefHeaderFromPreview(preview: string): BriefHeader {
  const headerText = preview.slice(0, 4500);
  const headerLines = splitLines(headerText).slice(0, 200);
  const warnings: string[] = [];

  const normalizedHeader = normHeader(headerText);

  const qualification =
    extractByPattern(normalizedHeader, /Qualification\s+(.+?)\s+Unit number/i) ||
    extractByLabelLines(headerLines, "Qualification");
  const unitNumberAndTitle =
    extractByPattern(normalizedHeader, /Unit number and title\s+([0-9]{4}\.\s+.+?)\s+Assignment title/i) ||
    extractByLabelLines(headerLines, "Unit number and title");
  const assignmentTitle =
    extractByPattern(normalizedHeader, /Assignment title\s+(.+?)\s+Assessor/i) ||
    extractByLabelLines(headerLines, "Assignment title");
  const assignment =
    extractByPattern(normalizedHeader, /Assignment\s+(\d+\s+of\s+\d+)/i) ||
    extractByLabelLines(headerLines, "Assignment") ||
    extractByLabelLines(headerLines, "Assignment number");
  const assessor =
    extractByPattern(normalizedHeader, /Assessor\s+(.+?)\s+Academic year/i) ||
    extractByLabelLines(headerLines, "Assessor");
  const unitCode =
    extractByPattern(normalizedHeader, /Unit Code\s+([A-Z0-9/]+)\b/i) ||
    extractByLabelLines(headerLines, "Unit Code");
  const internalVerifier =
    extractByPattern(normalizedHeader, /Internal Verifier\s+(.+?)\s+Verification Date/i) ||
    extractByLabelLines(headerLines, "Internal Verifier");

  let verificationDate =
    extractByPattern(normalizedHeader, /Verification Date\s+(.+?)\s+Issue Date/i) ||
    extractByLabelLines(headerLines, "Verification Date");
  if (verificationDate && !dateLike(verificationDate)) {
    warnings.push("verificationDate: ambiguous");
    verificationDate = null;
  }

  let issueDate =
    extractByPattern(normalizedHeader, /Issue Date\s+(.+?)\s+Final Submission Date/i) ||
    extractByLabelLines(headerLines, "Issue Date");
  if (issueDate && !dateLike(issueDate)) {
    warnings.push("issueDate: ambiguous");
    issueDate = null;
  }

  let finalSubmissionDate =
    extractByPattern(normalizedHeader, /Final Submission Date\s+(.+?)\s*(Policy on the Use of Artificial Intelligence|$)/i) ||
    extractByLabelLines(headerLines, "Final Submission Date");
  if (finalSubmissionDate) {
    const m = tidyDate(finalSubmissionDate).match(
      /(\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,}\s+\d{4})/i
    );
    if (m?.[1]) finalSubmissionDate = m[1];
    if (!dateLike(finalSubmissionDate)) {
      warnings.push("finalSubmissionDate: ambiguous");
      finalSubmissionDate = null;
    }
  }

  // Academic year is annoyingly inconsistent: some briefs show a proper year (2026), others show a cohort number (1).
  // We treat "1" as not useful and fall back to the Issue label (e.g., 2025/26) when present.
  let academicYear =
    extractByPattern(normalizedHeader, /Academic year\s+([0-9]{1,4}(?:\s*\/\s*\d{2,4})?)/i) ||
    extractByLabelLines(headerLines, "Academic year");
  if (academicYear) {
    academicYear = academicYear.replace(/\s*/g, "");
    if (!academicYearLike(academicYear)) {
      const fallback = extractAcademicYearFallback(preview);
      if (fallback) academicYear = fallback;
      else {
        warnings.push("academicYear: not detected");
        academicYear = null;
      }
    }
  } else {
    const fallback = extractAcademicYearFallback(preview);
    if (fallback) academicYear = fallback;
    else warnings.push("academicYear: not detected");
  }

  const out: BriefHeader = {
    qualification: qualification || null,
    unitNumberAndTitle: unitNumberAndTitle || null,
    assignmentTitle: assignmentTitle || null,
    assignment: assignment || null,
    assessor: assessor || null,
    unitCode: unitCode || null,
    internalVerifier: internalVerifier || null,
    verificationDate: verificationDate ? tidyDate(verificationDate) : null,
    verificationDateIso: parseDateIso(verificationDate),
    issueDate: issueDate ? tidyDate(issueDate) : null,
    issueDateIso: parseDateIso(issueDate),
    finalSubmissionDate: finalSubmissionDate ? tidyDate(finalSubmissionDate) : null,
    finalSubmissionDateIso: parseDateIso(finalSubmissionDate),
    academicYear: academicYear || null,
  };

  const missingFields = [
    ["Qualification", out.qualification],
    ["Unit number and title", out.unitNumberAndTitle],
    ["Assignment title", out.assignmentTitle],
    ["Assignment", out.assignment],
    ["Assessor", out.assessor],
    ["Academic year", out.academicYear],
    ["Unit Code", out.unitCode],
    ["Internal Verifier", out.internalVerifier],
    ["Verification Date", out.verificationDate],
    ["Issue Date", out.issueDate],
    ["Final Submission Date", out.finalSubmissionDate],
  ]
    .filter(([, value]) => !value)
    .map(([label]) => label as string);

  if (missingFields.length) {
    warnings.push(`Header fields missing: ${missingFields.join(", ")}`);
  }

  if (warnings.length) out.warnings = warnings;

  return out;
}

function cleanTaskLines(lines: string[]) {
  const isAiasPolicyLine = (text: string) => {
    const t = String(text || "").trim().replace(/\s+/g, " ");
    if (!t) return false;
    if (/^\(\s*aias\b.*level\s*\d+\s*\)\s*$/i.test(t)) return true;
    if (/^final$/i.test(t)) return true;
    if (/^submission\s+must\s+be\s+written\b/i.test(t)) return true;
    if (/^in\s+the\s+student.?s\s+own\s+words\b/i.test(t)) return true;
    if (/^and\s+demonstrate\s+personal\b/i.test(t)) return true;
    if (/^understanding\.?$/i.test(t)) return true;
    return false;
  };

  const cleaned = lines
    .map((line) => line.replace(/\t/g, "  ").replace(/[ \u00a0]+$/g, ""))
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      // Strip repeated page header artifacts that leak into extracted body text.
      if (/^task\s+\d+\s*$/i.test(t)) return false;
      if (/^\(\s*no\s+ai\s*\)\s*$/i.test(t)) return false;
      if (isAiasPolicyLine(t)) return false;
      return true;
    });
  while (cleaned.length && cleaned[0].trim() === "") cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1].trim() === "") cleaned.pop();
  return cleaned;
}

function stripAiasPolicyBanner(text: string) {
  return String(text || "")
    .replace(/(?:^|\n)\s*\(\s*aias\b[^\n]*\)\s*(?=\n|$)/gi, "\n")
    .replace(/(?:^|\n)\s*final\s*(?=\n|$)/gi, "\n")
    .replace(/(?:^|\n)\s*submission\s+must\s+be\s+written[^\n]*(?=\n|$)/gi, "\n")
    .replace(/(?:^|\n)\s*in\s+the\s+student.?s\s+own\s+words[^\n]*(?=\n|$)/gi, "\n")
    .replace(/(?:^|\n)\s*and\s+demonstrate\s+personal[^\n]*(?=\n|$)/gi, "\n")
    .replace(/(?:^|\n)\s*understanding\.?\s*(?=\n|$)/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shouldReflowPartLines(lines: string[]) {
  const nonEmpty = lines.filter((line) => line.trim());
  if (!nonEmpty.length) return false;
  const listLines = nonEmpty.filter((line) => isListMarkerLine(line)).length;
  return listLines === 0;
}

function relocateSamplePowerTableToPartA(text: string) {
  const source = String(text || "");
  if (!source.trim()) return source;

  const anchor = /results?\s+are\s+as\s+follows:\s*/i.exec(source);
  if (!anchor || typeof anchor.index !== "number") return source;

  const tableMatch = /(?:^|\n)\s*Sample\s+(?:\d+\s+){5,}\d+\s*\n\s*Power\s*\(\+?dBm\)\s+(?:\d+(?:\.\d+)?\s+){5,}\d+(?:\.\d+)?/im.exec(source);
  if (!tableMatch || typeof tableMatch.index !== "number") return source;
  if (tableMatch.index < anchor.index) return source;

  const tableChunk = tableMatch[0].trim();
  const withoutTable = `${source.slice(0, tableMatch.index)}${source.slice(tableMatch.index + tableMatch[0].length)}`
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const anchorInClean = /results?\s+are\s+as\s+follows:\s*/i.exec(withoutTable);
  if (!anchorInClean || typeof anchorInClean.index !== "number") return source;

  const insertAt = anchorInClean.index + anchorInClean[0].length;
  const rebuilt = `${withoutTable.slice(0, insertAt)}\n\n${tableChunk}\n${withoutTable.slice(insertAt)}`
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return rebuilt;
}

function extractParts(text: string): Array<{ key: string; text: string }> | null {
  const lines = splitLines(text);
  const parts: Array<{ key: string; text: string }> = [];
  let currentKey: string | null = null;
  let currentText: string[] = [];
  let currentLetter: string | null = null;
  const romanLikeSingle = new Set(["i", "v", "x", "l", "c", "d", "m"]);

  const isNextAlphabetic = (prev: string | null, next: string) => {
    if (!prev || prev.length !== 1 || next.length !== 1) return false;
    const a = prev.charCodeAt(0);
    const b = next.charCodeAt(0);
    return b === a + 1;
  };

  const flush = () => {
    if (currentKey) {
      const cleanedLines = cleanTaskLines(currentText);
      if (cleanedLines.length) {
        const rawBlob = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
        const containsInlineSampleTable =
          /(?:^|\n)\s*Sample\s+(?:\d+\s+){5,}\d+/i.test(rawBlob) &&
          /\bPower\s*\(\+?dBm\)\b/i.test(rawBlob);
        const blob = !containsInlineSampleTable && shouldReflowPartLines(cleanedLines)
          ? reflowProsePreserveLists(rawBlob)
          : rawBlob;
        if (blob) parts.push({ key: currentKey, text: blob });
      }
    }
    currentText = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentText.push("");
      continue;
    }

    const numberMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)$/);
    if (numberMatch) {
      flush();
      currentKey = numberMatch[1];
      currentLetter = null;
      currentText.push(numberMatch[2]);
      continue;
    }

    const letterMatch = trimmed.match(/^([a-z])\)\s+(.*)$/i);
    if (letterMatch) {
      const candidate = letterMatch[1].toLowerCase();
      const shouldTreatAsRoman =
        romanLikeSingle.has(candidate) &&
        currentLetter !== null &&
        !isNextAlphabetic(currentLetter, candidate);
      if (shouldTreatAsRoman) {
        flush();
        const romanKey = candidate;
        currentKey = currentLetter ? `${currentLetter}.${romanKey}` : romanKey;
        currentText.push(letterMatch[2]);
        continue;
      }

      flush();
      currentKey = candidate;
      currentLetter = currentKey;
      currentText.push(letterMatch[2]);
      continue;
    }

    const romanMatch = trimmed.match(/^([ivxlcdm]+)[\.\)]\s+(.*)$/i);
    if (romanMatch) {
      flush();
      const romanKey = romanMatch[1].toLowerCase();
      currentKey = currentLetter ? `${currentLetter}.${romanKey}` : romanKey;
      currentText.push(romanMatch[2]);
      continue;
    }

    currentText.push(trimmed);
  }

  flush();
  if (parts.length >= 2) {
    const sampleLinePattern = /Sample\s+(?:\d+\s+){5,}\d+/i;
    const powerLinePattern = /Power\s*\(\+?dBm\)\s+(?:\d+(?:\.\d+)?\s+){5,}\d+(?:\.\d+)?/i;
    const tableChunkPattern = new RegExp(
      `(${sampleLinePattern.source}[\\s\\S]*?${powerLinePattern.source})`,
      "i"
    );

    const partA = parts.find((p) => p.key === "a");
    const partAHasAnchor = partA ? /results?\s+are\s+as\s+follows/i.test(partA.text) : false;
    const donor = parts.find((p) => /^b\.ii$/i.test(p.key) && tableChunkPattern.test(p.text));
    if (partA && partAHasAnchor && donor) {
      const match = donor.text.match(tableChunkPattern);
      const tableChunkRaw = match?.[1]?.trim();
      const tableChunk = tableChunkRaw
        ? tableChunkRaw
            .replace(/\s+(Power\s*\(\+?dBm\)\b)/i, "\n$1")
            .replace(/\s{2,}/g, " ")
            .trim()
        : null;
      if (tableChunk) {
        donor.text = donor.text.replace(tableChunkPattern, "").replace(/\n{3,}/g, "\n\n").trim();
        partA.text = `${partA.text}\n\n${tableChunk}`.replace(/\n{3,}/g, "\n\n").trim();
      }
    }
  }
  return parts.length >= 2 ? parts : null;
}

function extractBriefTasks(
  text: string,
  pages: string[]
): {
  tasks: BriefTask[];
  scenarios: BriefScenario[];
  warnings: string[];
  endMatter: { sourcesBlock: string | null; criteriaBlock: string | null } | null;
} {
  const warnings: string[] = [];
  const sourcePages = pages.length ? pages : [text];
  const normalizeLine = (line: string) =>
    line.replace(/\t/g, "  ").replace(/\u00a0/g, " ").replace(/[ ]+$/g, "").trim();
  const compactLine = (line: string) => normalizeWhitespace(line).trim();
  const cleanedPages = sourcePages.map((pageText) => {
    const lines = stripFooterLines(splitLines(pageText));
    return lines.map((line) => normalizeLine(line)).join("\n");
  });
  const linesWithPages: Array<{ line: string; page: number }> = [];
  const endMatter = extractEndMatterBlocks(cleanedPages);
  const pageBreaksMissing = pages.length <= 1;
  if (pageBreaksMissing) warnings.push("page breaks missing; page numbers unreliable.");

  let stop = false;
  cleanedPages.forEach((pageText, idx) => {
    if (stop) return;
    const pageNumber = pages.length ? idx + 1 : 1;
    const lines = splitLines(pageText);
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
      let normalizedLine = normalizeLine(lines[lineIdx]);
      const compact = compactLine(normalizedLine);
      const primaryKey = getPrimaryEndMatterKeyFromWindow(lines, lineIdx);
      if (primaryKey) {
        stop = true;
        break;
      }
      const secondaryKey = getSecondaryEndMatterKey(compact);
      if (secondaryKey) {
        const headingLike = isHeadingLike(compact);
        if (headingLike) {
          stop = true;
          break;
        }
      }

      const nextLine = lines[lineIdx + 1] ? normalizeLine(lines[lineIdx + 1]) : "";
      const taskWordCandidate = compact.replace(/^[^A-Za-z0-9]+/, "").trim();
      const isTaskWordOnly =
        /^task$/i.test(taskWordCandidate) ||
        (/\bt\s*a\s*s\s*k\b/i.test(taskWordCandidate) && !/\bt\s*a\s*s\s*k\s*\d/i.test(taskWordCandidate));
      if (isTaskWordOnly && nextLine && /^\d{1,2}\b/.test(nextLine)) {
        normalizedLine = `Task ${nextLine}`.trim();
        linesWithPages.push({ line: normalizedLine, page: pageNumber });
        lineIdx += 1;
        continue;
      }

      linesWithPages.push({ line: normalizedLine, page: pageNumber });
    }
  });

  const scoreHeadingCandidate = (raw: string, title: string | null) => {
    let score = 0;
    if (title) score += 10;
    if (/activity/i.test(raw)) score += 5;
    if (/[:\-–—]\s*\S/.test(raw)) score += 2;
    if (title) score += Math.min(3, Math.floor(title.length / 40));
    return score;
  };

  const parseHeading = (raw: string, allowNumericOnly = false) => {
    if (!raw) return null;

    let n: number | null = null;
    let remainder = "";

    const explicitTask = raw.match(/^\s*[^A-Za-z0-9]{0,6}task\s*(\d{1,2})\b(.*)$/i);
    if (explicitTask) {
      n = Number(explicitTask[1]);
      remainder = explicitTask[2] || "";
    } else if (allowNumericOnly) {
      const numericOnly = raw.match(/^\s*[^A-Za-z0-9]{0,4}(\d{1,2})\s*[\.:\)-]\s+(.+)$/);
      if (numericOnly) {
        n = Number(numericOnly[1]);
        remainder = numericOnly[2] || "";
      }
    }

    if (!n || Number.isNaN(n)) return null;

    const cleanedRemainder = remainder
      .replace(/^\s*\(.*?\)\s*/i, "")
      .replace(/^\s*[:\-–—]\s*/i, "")
      .trim();
    const title = cleanedRemainder ? normalizeWhitespace(cleanedRemainder) : null;
    const score = scoreHeadingCandidate(raw, title);
    return { n, title, score };
  };

  const promoteTasksFromEndMatterBlock = (
    blockText: string | null,
    existingNumbers: Set<number>,
    fallbackPage: number | null
  ) => {
    if (!blockText) return { remainingText: blockText, tasks: [] as BriefTask[] };
    const lines = splitLines(blockText);
    const headings = lines
      .map((line, index) => ({ line: normalizeLine(line), index }))
      .map(({ line, index }) => ({ heading: parseHeading(line), index }))
      .filter(({ heading }) => !!heading) as Array<{
      heading: { n: number; title?: string | null; score: number };
      index: number;
    }>;

    if (!headings.length) return { remainingText: blockText, tasks: [] as BriefTask[] };

    const keepLine = new Array(lines.length).fill(true);
    const promoted: BriefTask[] = [];

    headings.forEach((entry, idx) => {
      const start = entry.index;
      const end = idx + 1 < headings.length ? headings[idx + 1].index : lines.length;
      for (let i = start; i < end; i += 1) keepLine[i] = false;
      const n = entry.heading.n;
      if (existingNumbers.has(n)) return;

      const bodyLines = cleanTaskLines(lines.slice(start + 1, end));
      let textBody = bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "");
      const titleLine = entry.heading.title ? normalizeWhitespace(entry.heading.title) : null;
      if (titleLine && !normalizeWhitespace(textBody).toLowerCase().includes(titleLine.toLowerCase())) {
        textBody = [titleLine, textBody].filter(Boolean).join("\n");
      }
      if (!textBody.trim()) {
        textBody = titleLine || `Task ${n}`;
      }

      const previewLines = lines.slice(start, Math.min(start + 6, lines.length));
      const aias =
        extractAiasValue(normalizeWhitespace(previewLines.join(" "))) ||
        extractAiasValue(textBody);
      const pagesForTask = fallbackPage ? [fallbackPage] : undefined;

      const reflowedTextBody = reflowPreservingTables(textBody);
      promoted.push({
        n,
        label: `Task ${n}`,
        title: titleLine,
        aias,
        pages: pagesForTask,
        text: reflowedTextBody,
        prompt: reflowedTextBody,
        confidence: "HEURISTIC",
      });
      existingNumbers.add(n);
    });

    const remainingLines = lines.filter((_, idx) => keepLine[idx]);
    const remainingText = remainingLines.join("\n").trim() || null;
    return { remainingText, tasks: promoted };
  };

  const hasExplicitTaskHeadings = linesWithPages.some((entry) => /^\s*[^A-Za-z0-9]{0,6}task\s*\d{1,2}\b/i.test(entry.line));

  let startIndex = 0;
  for (let i = 0; i < linesWithPages.length; i += 1) {
    const h = parseHeading(linesWithPages[i].line, !hasExplicitTaskHeadings);
    if (h?.n === 1) {
      startIndex = Math.max(0, i - 10);
      break;
    }
  }

  const candidates: Array<{ index: number; n: number; title?: string | null; page: number; score: number }> = [];
  const headingCandidateIndices = new Set<number>();
  for (let i = startIndex; i < linesWithPages.length; i += 1) {
    const raw = linesWithPages[i].line;
    const heading = parseHeading(raw, !hasExplicitTaskHeadings);
    if (!heading) continue;
    headingCandidateIndices.add(i);
    candidates.push({
      index: i,
      n: heading.n,
      title: heading.title,
      page: linesWithPages[i].page,
      score: heading.score,
    });
  }

  if (!candidates.length) {
    warnings.push("Task headings not found (expected “Task 1”, “Task 2”, …).");
    return { tasks: [], scenarios: [], warnings, endMatter };
  }

  const candidatesByNumber = new Map<number, Array<{ index: number; n: number; title?: string | null; page: number; score: number }>>();
  for (const candidate of candidates) {
    if (!candidatesByNumber.has(candidate.n)) candidatesByNumber.set(candidate.n, []);
    candidatesByNumber.get(candidate.n)!.push(candidate);
  }

  const selectedHeadings: Array<{ index: number; n: number; title?: string | null; page: number; score: number }> = [];
  for (const [n, group] of candidatesByNumber.entries()) {
    // Prefer the earliest heading when scores tie; later repeats are usually page-header duplicates.
    const best = [...group].sort((a, b) => b.score - a.score || a.index - b.index)[0];
    selectedHeadings.push(best);
  }
  selectedHeadings.sort((a, b) => a.index - b.index);

  const tasks: BriefTask[] = [];

  const scenarioHeadingRegex = /(vocational\s+scenario(?:\s+or\s+context)?|scenario\s+or\s+context)\b/i;
  const scenarioRanges: Array<{ start: number; end: number; appliesToTask?: number; pages: number[]; text: string }> = [];
  const scenarios: BriefScenario[] = [];

  for (let i = 0; i < linesWithPages.length; i += 1) {
    const line = linesWithPages[i]?.line || "";
    let headingEndIndex = i;
    let headingMatched = scenarioHeadingRegex.test(line);
    if (!headingMatched) {
      const windowText = [line, linesWithPages[i + 1]?.line || "", linesWithPages[i + 2]?.line || ""]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      headingMatched = scenarioHeadingRegex.test(windowText);
      if (headingMatched) {
        headingEndIndex = i + 2;
      }
    }
    if (!headingMatched) continue;
    const nextTask = selectedHeadings.find((candidate) => candidate.index > i);
    if (!nextTask) continue;
    const nextScenarioHeadingIndex = linesWithPages.findIndex(
      (entry, lineIndex) => lineIndex > i && scenarioHeadingRegex.test(entry.line)
    );
    const endIndex =
      nextScenarioHeadingIndex > i
        ? Math.min(nextTask.index, nextScenarioHeadingIndex)
        : nextTask.index;
    if (endIndex <= headingEndIndex + 1) continue;
    const scenarioLines = cleanTaskLines(
      linesWithPages.slice(headingEndIndex + 1, endIndex).map((entry) => entry.line)
    );
    const scenarioText = scenarioLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    const cleanedScenarioText = scenarioText.replace(/^context\b\s*[:\-–—]?\s*/i, "").trim();
    if (!cleanedScenarioText) continue;
    const scenarioPages = Array.from(new Set(linesWithPages.slice(i, endIndex).map((entry) => entry.page)));
    scenarioRanges.push({
      start: i,
      end: endIndex,
      appliesToTask: nextTask.n,
      pages: scenarioPages,
      text: cleanedScenarioText,
    });
    scenarios.push({
      text: cleanedScenarioText,
      pages: scenarioPages,
      appliesToTask: nextTask.n,
    });
    i = endIndex - 1;
  }

  const firstHeading = selectedHeadings[0];
  if (firstHeading && firstHeading.index > 0) {
    const preLines = linesWithPages.slice(0, firstHeading.index).map((l) => l.line).join("\n");
    if (/Initial Idea Proposal/i.test(preLines)) {
      const preText = cleanTaskLines(preLines.split("\n")).join("\n").trim();
      if (preText) {
        tasks.push({
          n: 0,
          label: "Task 0",
          title: "Initial Idea Proposal (AIAS 2)",
          text: preText,
          prompt: preText,
          pages: Array.from(new Set(linesWithPages.slice(0, firstHeading.index).map((l) => l.page))),
          confidence: "HEURISTIC",
        });
      }
    }
  }

  const MIN_TASK_BODY_CHARS = 250;
  const contaminationAnchors = [
    /\bsources\s+of\s+information\b/i,
    /\brelevant\s+learning\s+outcomes\s+and\s+assessment\s+criteria\b/i,
    /\brecommended\s+resources\b/i,
  ];

  const dedupeConsecutiveLines = (lines: string[]) => {
    const out: string[] = [];
    for (const line of lines) {
      if (!line.trim()) {
        if (out.length && out[out.length - 1] === "") continue;
        out.push("");
        continue;
      }
      if (
        out.length &&
        out[out.length - 1] &&
        normalizeWhitespace(out[out.length - 1]).toLowerCase() === normalizeWhitespace(line).toLowerCase()
      ) {
        continue;
      }
      out.push(line);
    }
    return out;
  };

  const trimAtEndMatter = (lines: string[]) => {
    let cut = lines.length;
    for (let i = 0; i < lines.length; i += 1) {
      const compact = normalizeWhitespace(lines[i]).toLowerCase();
      if (!compact) continue;
      if (
        contaminationAnchors.some((cue) => cue.test(compact)) ||
        /\b(textbooks?|websites?|further\s+reading|additional\s+resources?)\b/i.test(compact)
      ) {
        cut = i;
        break;
      }
    }
    return lines.slice(0, cut);
  };

  selectedHeadings.forEach((heading, idx) => {
    const start = heading.index + 1;
    const end = idx + 1 < selectedHeadings.length ? selectedHeadings[idx + 1].index : linesWithPages.length;
    const bodyLines = cleanTaskLines(
      linesWithPages
        .slice(start, end)
        .filter((_line, lineIndex) => {
          const absoluteIndex = start + lineIndex;
          return !scenarioRanges.some((range) => absoluteIndex >= range.start && absoluteIndex < range.end);
        })
        .filter((_line, lineIndex) => !headingCandidateIndices.has(start + lineIndex))
        .map((l) => l.line)
    );
    const decontaminatedBodyLines = dedupeConsecutiveLines(trimAtEndMatter(bodyLines));
    let textBody = decontaminatedBodyLines.join("\n");
    textBody = textBody.replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "");

    const taskWarnings: string[] = [];
    if (!textBody.trim()) {
      const fallback = heading.title ? `Task ${heading.n} — ${heading.title}` : `Task ${heading.n}`;
      textBody = fallback;
      taskWarnings.push("task body: empty");
    }

    const normalizedBody = normalizeWhitespace(textBody);
    const contaminated = contaminationAnchors.some((cue) => cue.test(normalizedBody));
    if (contaminated) taskWarnings.push("possible end-matter contamination");

    if (textBody.trim().length < MIN_TASK_BODY_CHARS) {
      taskWarnings.push("task body: suspiciously short");
    }

    if (pageBreaksMissing) {
      taskWarnings.push("page breaks missing; page numbers unreliable");
    }

    const previewLines = linesWithPages
      .slice(heading.index, Math.min(heading.index + 6, linesWithPages.length))
      .map((l) => l.line);
    const aias =
      extractAiasValue(normalizeWhitespace(previewLines.join(" "))) ||
      extractAiasValue(textBody);
    const pagesForTask = Array.from(new Set(linesWithPages.slice(heading.index, end).map((l) => l.page)));

    const reflowedTextBody = stripAiasPolicyBanner(
      relocateSamplePowerTableToPartA(reflowPreservingTables(textBody))
    );
    const parts = extractParts(reflowedTextBody);
    const confidenceWarnings = taskWarnings;
    tasks.push({
      n: heading.n,
      label: `Task ${heading.n}`,
      title: heading.title || null,
      aias,
      pages: pagesForTask,
      text: reflowedTextBody,
      prompt: reflowedTextBody,
      parts: parts || undefined,
      scenarioText: scenarios.find((scenario) => scenario.appliesToTask === heading.n)?.text || null,
      warnings: taskWarnings.length ? taskWarnings : undefined,
      confidence: confidenceWarnings.length ? "HEURISTIC" : "CLEAN",
    });
  });

  let updatedEndMatter = endMatter;
  if (endMatter) {
    const existingNumbers = new Set(tasks.map((task) => task.n));
    const fallbackPage = pages.length ? pages.length : null;
    const sourcesResult = promoteTasksFromEndMatterBlock(
      endMatter.sourcesBlock,
      existingNumbers,
      fallbackPage
    );
    const criteriaResult = promoteTasksFromEndMatterBlock(
      endMatter.criteriaBlock,
      existingNumbers,
      fallbackPage
    );
    const promotedTasks = [...sourcesResult.tasks, ...criteriaResult.tasks];
    if (promotedTasks.length) {
      tasks.push(...promotedTasks);
      tasks.sort((a, b) => a.n - b.n);
    }
    const sourcesBlock = sourcesResult.remainingText;
    const criteriaBlock = criteriaResult.remainingText;
    updatedEndMatter = sourcesBlock || criteriaBlock ? { sourcesBlock, criteriaBlock } : null;
  }

  return { tasks, scenarios, warnings, endMatter: updatedEndMatter };
}

function parseUnitNumberAndTitle(raw: string | null | undefined): { unitNumber?: string; unitTitle?: string } {
  if (!raw) return {};
  const m = raw.match(/(\d{4})\.\s*(.+)/);
  if (!m) return {};
  return { unitNumber: m[1], unitTitle: normalizeWhitespace(m[2]) };
}

function buildBriefTitle(header: BriefHeader, assignmentNumber: number | null, fallbackTitle: string) {
  const parsed = parseUnitNumberAndTitle(header.unitNumberAndTitle || "");
  if (parsed.unitNumber && parsed.unitTitle && assignmentNumber) {
    return `Unit ${parsed.unitNumber} - ${parsed.unitTitle} - Assignment ${assignmentNumber}`;
  }
  if (parsed.unitNumber && parsed.unitTitle) {
    return `Unit ${parsed.unitNumber} - ${parsed.unitTitle}`;
  }
  if (header.assignmentTitle && assignmentNumber) {
    return `${normalizeWhitespace(header.assignmentTitle)} - Assignment ${assignmentNumber}`;
  }
  return fallbackTitle || header.assignmentTitle || null;
}

function extractCriteriaRefs(pageText: string) {
  return extractCriteriaCodesFromText(pageText);
}

function extractLoHeaders(pageText: string) {
  const out: string[] = [];
  const normalized = normalizeWhitespace(pageText);
  const matches = normalized.matchAll(/\bLO\s*([1-6])\s*[:\-–]?\s*([^L]+?)(?=\bLO\s*[1-6]\b|$)/gi);
  for (const m of matches) {
    const code = `LO${m[1]}`;
    const desc = normalizeWhitespace(m[2] || "").replace(/\s+/g, " ").trim();
    if (desc) out.push(`${code}: ${desc}`);
  }
  return out;
}

function findCriteriaRegion(pages: string[]) {
  if (!pages.length) return { text: "", pages: [] as number[] };
  const anchorRegex = /\brelevant\s+learning\s+outcomes\s+and\s+assessment\s+criteria\b/i;

  for (let idx = 0; idx < pages.length; idx += 1) {
    const lines = splitLines(pages[idx]);
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
      const window = lines
        .slice(lineIdx, lineIdx + END_MATTER_ANCHOR_WINDOW)
        .map((line) => normalizeHeadingCandidate(line))
        .filter(Boolean)
        .join(" ");
      if (anchorRegex.test(window)) {
        const nextPage = pages[idx + 1];
        const regionText = [pages[idx], nextPage].filter(Boolean).join("\n");
        const regionPages = [idx + 1, idx + 2].filter((page) => page <= pages.length);
        return { text: regionText, pages: regionPages };
      }
    }
  }

  return { text: "", pages: [] as number[] };
}

export function extractBrief(
  text: string,
  fallbackTitle: string,
  options?: { equations?: BriefEquation[] }
) {
  const t = text || "";

  // Unit number and title 4015: ...
  const unitCodeGuess =
    firstMatch(t, /\bUnit\s+number\s+and\s+title\s+(4\d{3})\b/i) ||
    firstMatch(t, /\bUnit\s+(4\d{3})\b/i) ||
    firstMatch(fallbackTitle || "", /\b(4\d{3})\b/i);

  // Assignment 1 of 2
  const ass1 = t.match(/\bAssignment\s+(\d+)\s+of\s+(\d+)\b/i);
  const assignmentNumber = ass1?.[1] ? Number(ass1[1]) : null;
  const totalAssignments = ass1?.[2] ? Number(ass1[2]) : null;

  // Assignment title
  const assignmentTitle =
    firstMatch(t, /\bAssignment\s+title\s+([^\n\r]+)\b/i) ||
    firstMatch(t, /\bAssignment\s+title\s*[:\-]\s*([^\n\r]+)\b/i) ||
    null;

  // AIAS – LEVEL 1
  const aiasLevelMatches = extractAiasLevelsFromText(t);
  const aiasLevelFromDoc = aiasLevelMatches.length ? Math.min(...aiasLevelMatches) : null;

  // Assignment code: prefer derived from assignmentNumber
  const codeGuess =
    assignmentNumber ? `A${assignmentNumber}` :
    (t.match(/\bA\d+\b/i)?.[0]?.toUpperCase() ?? null);

  // Criteria codes: detect P/M/D numbers
  const detectedCriterionCodes = extractCriteriaCodesFromText(t);

  const pages = splitPages(t);
  const headerSource = pages[0] || t.slice(0, 4500);
  const header = extractBriefHeaderFromPreview(headerSource);
  const tasksResult = extractBriefTasks(t, pages);
  const taskAiasLevels = tasksResult.tasks
    .map((task) => Number(task.aias?.match(/\d/)?.[0]))
    .filter((value) => !Number.isNaN(value));
  const aiasLevelFromTasks = taskAiasLevels.length ? Math.min(...taskAiasLevels) : null;
  const aiasLevel = aiasLevelFromDoc ?? aiasLevelFromTasks ?? null;
  const criteriaRegion = findCriteriaRegion(pages);
  const criteriaRefs = criteriaRegion.text ? extractCriteriaRefs(criteriaRegion.text) : detectedCriterionCodes;
  const criteriaCodes = criteriaRefs.length ? criteriaRefs : detectedCriterionCodes;
  const loHeaders = criteriaRegion.text ? extractLoHeaders(criteriaRegion.text) : [];

  const warnings = [
    ...(header.warnings || []),
    ...(tasksResult.warnings || []),
  ];
  const titleFromBody = assignmentTitle ? normalizeWhitespace(assignmentTitle) : null;
  const titleFromHeader = buildBriefTitle(header, assignmentNumber, titleFromBody || fallbackTitle);

  const tokenRegex = /\[\[EQ:([^\]]+)\]\]/g;
  const collectEqIds = (value: string | null | undefined, target: Set<string>) => {
    const textValue = String(value || "");
    let m: RegExpExecArray | null;
    while ((m = tokenRegex.exec(textValue))) {
      if (m[1]) target.add(m[1]);
    }
  };
  const usedEqIds = new Set<string>();
  for (const scenario of tasksResult.scenarios || []) {
    collectEqIds(scenario?.text, usedEqIds);
  }
  for (const task of tasksResult.tasks || []) {
    collectEqIds(task?.text, usedEqIds);
    collectEqIds(task?.prompt, usedEqIds);
    collectEqIds(task?.scenarioText, usedEqIds);
    for (const part of task?.parts || []) collectEqIds(part?.text, usedEqIds);
  }
  const filteredEquations = Array.isArray(options?.equations)
    ? options!.equations.filter((eq) => usedEqIds.has(eq.id))
    : [];

  return {
    kind: "BRIEF" as const,
    title: titleFromHeader || titleFromBody || null,
    header,
    assignmentCode: codeGuess,
    unitCodeGuess: unitCodeGuess || null,
    assignmentNumber,
    totalAssignments,
    aiasLevel,
    detectedCriterionCodes,
    criteriaRefs,
    criteriaCodes,
    loHeaders,
    endMatter: tasksResult.endMatter || null,
    equations: filteredEquations,
    scenarios: tasksResult.scenarios,
    tasks: tasksResult.tasks,
    warnings: warnings.length ? warnings : undefined,
  };
}

export function debugBriefExtraction(text: string) {
  const pages = splitPages(text);
  const headerSource = pages[0] || text;
  const header = extractBriefHeaderFromPreview(headerSource);
  const tasks = extractBriefTasks(text, pages);
  const criteriaRegion = findCriteriaRegion(pages);
  const criteriaRefs = criteriaRegion.text ? extractCriteriaRefs(criteriaRegion.text) : [];
  const loHeaders = criteriaRegion.text ? extractLoHeaders(criteriaRegion.text) : [];

  return {
    pageCount: pages.length,
    criteriaPages: criteriaRegion.pages,
    pages: pages.map((p, idx) => ({
      page: idx + 1,
      chars: p.length,
      preview: p.slice(0, 300),
    })),
    header,
    tasks: tasks.tasks.map((t) => ({
      n: t.n,
      label: t.label,
      pages: t.pages,
      promptPreview: (t.text || "").slice(0, 300),
    })),
    scenarios: tasks.scenarios,
    endMatter: tasks.endMatter || null,
    criteriaRefs,
    loHeaders,
  };
}
