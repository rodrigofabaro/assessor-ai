import { normalizeWhitespace } from "../common";
import type { BriefHeader } from "./types";
import { splitLines } from "./utils";

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
  if (/no later than\s+\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,}\s+\d{4}/i.test(v)) return true;
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
  const d = t.match(/\bIssue Date\s+(\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,}\s+\d{4})\b/i);
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
    extractByPattern(
      normalizedHeader,
      /Final Submission Date\s+(.+?)\s*(Policy on the Use of Artificial Intelligence|$)/i
    ) ||
    extractByLabelLines(headerLines, "Final Submission Date");
  if (finalSubmissionDate) {
    const m = tidyDate(finalSubmissionDate).match(/(\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,}\s+\d{4})/i);
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

export function parseUnitNumberAndTitle(raw: string | null | undefined): { unitNumber?: string; unitTitle?: string } {
  if (!raw) return {};
  const m = raw.match(/(\d{4})\.\s*(.+)/);
  if (!m) return {};
  return { unitNumber: m[1], unitTitle: normalizeWhitespace(m[2]) };
}

export function buildBriefTitle(header: BriefHeader, assignmentNumber: number | null, fallbackTitle: string) {
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
