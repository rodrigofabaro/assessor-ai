import { firstMatch, normalizeWhitespace } from "./common";

/**
 * BRIEF extractor
 * - Keeps the existing "brief core" extraction (unit guess, assignment number, criteria codes, etc.)
 * - Adds a conservative header snapshot extractor used for audit/version control.
 */

type BriefHeader = {
  qualification?: string | null;
  unitNumberAndTitle?: string | null;
  assessor?: string | null;
  unitCode?: string | null;
  internalVerifier?: string | null;
  verificationDate?: string | null;
  issueDate?: string | null;
  finalSubmissionDate?: string | null;
  academicYear?: string | null;
  warnings?: string[];
};

function uniqSortedCodes(codes: string[]) {
  const set = new Set(codes.map((c) => c.toUpperCase().trim()).filter(Boolean));
  const arr = Array.from(set);
  const bandRank = (x: string) => (x[0] === "P" ? 0 : x[0] === "M" ? 1 : 2);
  arr.sort(
    (a, b) =>
      bandRank(a) - bandRank(b) ||
      (parseInt(a.slice(1), 10) || 0) - (parseInt(b.slice(1), 10) || 0)
  );
  return arr;
}

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
  if (/^\d{4}\s*\/\s*\d{2}$/.test(v)) return true; // 2025/26
  if (/^\d{4}\s*[-/]\s*\d{2,4}$/.test(v)) return true;
  if (/^\d{4}$/.test(v)) return true;
  return false;
}

function tidyDate(s: string) {
  const v = normHeader(s);
  return v.replace(/(\d{1,2})\s*(st|nd|rd|th)\b/gi, "$1$2");
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
  "Unit Code",
  "Assessor",
  "Internal Verifier",
  "Verification Date",
  "Issue Date",
  "Final Submission Date",
  "Academic year",
];

function extractByLabelRegion(text: string, label: string) {
  const t = normHeader(text);
  const idx = t.toLowerCase().indexOf(label.toLowerCase());
  if (idx < 0) return null;

  const after = t.slice(idx + label.length).trim();
  if (!after) return null;

  let stop = after.length;
  for (const other of LABELS) {
    if (other.toLowerCase() === label.toLowerCase()) continue;
    const j = after.toLowerCase().indexOf(other.toLowerCase());
    if (j >= 0 && j < stop) stop = j;
  }

  let raw = after.slice(0, stop).trim();

  if (/^Academic year$/i.test(label)) {
    raw = raw.split(/\bUnit Code\b/i)[0].split(/\bAssignment\b/i)[0].trim();
  }
  if (/^Unit Code$/i.test(label)) {
    raw = raw.split(/\bAssignment\b/i)[0].trim();
  }

  return raw || null;
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
  const warnings: string[] = [];

  const qualification = extractByLabelRegion(headerText, "Qualification");
  const unitNumberAndTitle = extractByLabelRegion(headerText, "Unit number and title");
  const assessor = extractByLabelRegion(headerText, "Assessor");
  const unitCode = extractByLabelRegion(headerText, "Unit Code");
  const internalVerifier = extractByLabelRegion(headerText, "Internal Verifier");

  let verificationDate = extractByLabelRegion(headerText, "Verification Date");
  if (verificationDate && !dateLike(verificationDate)) {
    warnings.push("verificationDate: ambiguous");
    verificationDate = null;
  }

  let issueDate = extractByLabelRegion(headerText, "Issue Date");
  if (issueDate && !dateLike(issueDate)) {
    warnings.push("issueDate: ambiguous");
    issueDate = null;
  }

  let finalSubmissionDate = extractByLabelRegion(headerText, "Final Submission Date");
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
  let academicYear = extractByLabelRegion(headerText, "Academic year");
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
    assessor: assessor || null,
    unitCode: unitCode || null,
    internalVerifier: internalVerifier || null,
    verificationDate: verificationDate ? tidyDate(verificationDate) : null,
    issueDate: issueDate ? tidyDate(issueDate) : null,
    finalSubmissionDate: finalSubmissionDate ? tidyDate(finalSubmissionDate) : null,
    academicYear: academicYear || null,
  };

  if (warnings.length) out.warnings = warnings;

  return out;
}

export function extractBrief(text: string, fallbackTitle: string) {
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
  const aiasLevelRaw = firstMatch(t, /\bAIAS\s*[–-]\s*LEVEL\s*(\d)\b/i);
  const aiasLevel = aiasLevelRaw ? Number(aiasLevelRaw) : null;

  // Assignment code: prefer derived from assignmentNumber
  const codeGuess =
    assignmentNumber ? `A${assignmentNumber}` :
    (t.match(/\bA\d+\b/i)?.[0]?.toUpperCase() ?? null);

  // Criteria codes: detect P/M/D numbers
  const codes = Array.from(t.toUpperCase().matchAll(/\b([PMD])\s*(\d{1,2})\b/g)).map(
    (m) => `${m[1]}${m[2]}`
  );
  const detectedCriterionCodes = uniqSortedCodes(codes);

  const preview = t.slice(0, 4500);
  const header = extractBriefHeaderFromPreview(preview);

  return {
    kind: "BRIEF" as const,
    title: assignmentTitle ? normalizeWhitespace(assignmentTitle) : null,
    header,
    assignmentCode: codeGuess,
    unitCodeGuess: unitCodeGuess || null,
    assignmentNumber,
    totalAssignments,
    aiasLevel,
    detectedCriterionCodes,
  };
}
