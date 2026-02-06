import { firstMatch, normalizeWhitespace } from "./common";

/**
 * BRIEF extractor
 * - Keeps the existing "brief core" extraction (unit guess, assignment number, criteria codes, etc.)
 * - Adds a conservative header snapshot extractor used for audit/version control.
 */

type BriefHeader = {
  qualification?: string | null;
  unitNumberAndTitle?: string | null;
  assignmentTitle?: string | null;
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
  const cleaned = lines.map((line) => line.replace(/\t/g, "  ").replace(/[ \u00a0]+$/g, ""));
  while (cleaned.length && cleaned[0].trim() === "") cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1].trim() === "") cleaned.pop();
  return cleaned;
}

function extractParts(text: string): Array<{ key: string; text: string }> | null {
  const lines = splitLines(text);
  const parts: Array<{ key: string; text: string }> = [];
  let currentKey: string | null = null;
  let currentText: string[] = [];
  let currentLetter: string | null = null;

  const flush = () => {
    if (currentKey) {
      const blob = normalizeWhitespace(currentText.join(" ").trim());
      if (blob) parts.push({ key: currentKey, text: blob });
    }
    currentText = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentText.push("");
      continue;
    }

    const numberMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberMatch) {
      flush();
      currentKey = numberMatch[1];
      currentLetter = null;
      currentText.push(numberMatch[2]);
      continue;
    }

    const letterMatch = trimmed.match(/^([a-z])\)\s+(.*)$/i);
    if (letterMatch) {
      flush();
      currentKey = letterMatch[1].toLowerCase();
      currentLetter = currentKey;
      currentText.push(letterMatch[2]);
      continue;
    }

    const romanMatch = trimmed.match(/^([ivxlcdm]+)\.\s+(.*)$/i);
    if (romanMatch && currentLetter) {
      flush();
      currentKey = `${currentLetter}.${romanMatch[1].toLowerCase()}`;
      currentText.push(romanMatch[2]);
      continue;
    }

    currentText.push(trimmed);
  }

  flush();
  return parts.length >= 2 ? parts : null;
}

function extractBriefTasks(text: string, pages: string[]): { tasks: BriefTask[]; warnings: string[] } {
  const warnings: string[] = [];
  const targetPages = pages.length ? pages.slice(2, 7) : [text];
  const linesWithPages: Array<{ line: string; page: number }> = [];
  const stopRegex = /Relevant Learning Outcomes and Assessment Criteria/i;

  let stop = false;
  targetPages.forEach((pageText, idx) => {
    if (stop) return;
    const pageNumber = pages.length ? idx + 3 : 1;
    const lines = splitLines(pageText);
    for (const line of lines) {
      if (stopRegex.test(line)) {
        stop = true;
        break;
      }
      linesWithPages.push({ line, page: pageNumber });
    }
  });

  const headingRegex = /^\s*task\s*(\d{1,2})\b(?:\s*(?:[:\-–]\s*(.*)|activity\s*[–-]?\s*(.*))?)?$/i;

  const headings: Array<{ index: number; n: number; title?: string | null; page: number }> = [];
  for (let i = 0; i < linesWithPages.length; i += 1) {
    const raw = linesWithPages[i].line;
    const match = raw.match(headingRegex);
    if (!match) continue;
    const n = Number(match[1]);
    if (!n || Number.isNaN(n)) continue;
    const titleRaw = match[2] || match[3] || "";
    const title = titleRaw ? normalizeWhitespace(titleRaw) : null;
    headings.push({ index: i, n, title, page: linesWithPages[i].page });
  }

  if (!headings.length) {
    warnings.push("Task headings not found (expected “Task 1”, “Task 2”, …).");
    return { tasks: [], warnings };
  }

  const tasks: BriefTask[] = [];

  const firstHeading = headings[0];
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
        });
      }
    }
  }

  headings.forEach((heading, idx) => {
    const start = heading.index + 1;
    const end = idx + 1 < headings.length ? headings[idx + 1].index : linesWithPages.length;
    const bodyLines = cleanTaskLines(linesWithPages.slice(start, end).map((l) => l.line));
    let textBody = bodyLines.join("\n");
    textBody = textBody.replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "");

    const taskWarnings: string[] = [];
    if (!textBody.trim()) taskWarnings.push("task body: empty");

    const previewLines = linesWithPages.slice(heading.index, Math.min(heading.index + 6, linesWithPages.length)).map((l) => l.line);
    const aiasMatch = normalizeWhitespace(previewLines.join(" ")).match(/\bAIAS\s*(\d)\b/i);
    const aias = aiasMatch ? `AIAS ${aiasMatch[1]}` : null;
    const pagesForTask = Array.from(new Set(linesWithPages.slice(heading.index, end).map((l) => l.page)));

    const parts = extractParts(textBody);
    tasks.push({
      n: heading.n,
      label: `Task ${heading.n}`,
      title: heading.title || null,
      aias,
      pages: pagesForTask,
      text: textBody,
      prompt: textBody,
      parts: parts || undefined,
      warnings: taskWarnings.length ? taskWarnings : undefined,
    });
  });

  return { tasks, warnings };
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
  const codes = Array.from(pageText.toUpperCase().matchAll(/\b([PMD])\s*(\d{1,2})\b/g)).map((m) => `${m[1]}${m[2]}`);
  return uniqSortedCodes(codes);
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

  const pages = splitPages(t);
  const headerSource = pages[0] || t.slice(0, 4500);
  const header = extractBriefHeaderFromPreview(headerSource);
  const tasksResult = extractBriefTasks(t, pages);
  const criteriaPage = pages[8] || "";
  const criteriaRefs = criteriaPage ? extractCriteriaRefs(criteriaPage) : [];
  const loHeaders = criteriaPage ? extractLoHeaders(criteriaPage) : [];

  const warnings = [
    ...(header.warnings || []),
    ...(tasksResult.warnings || []),
  ];
  const titleFromBody = assignmentTitle ? normalizeWhitespace(assignmentTitle) : null;
  const titleFromHeader = buildBriefTitle(header, assignmentNumber, titleFromBody || fallbackTitle);

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
    loHeaders,
    tasks: tasksResult.tasks,
    warnings: warnings.length ? warnings : undefined,
  };
}

export function debugBriefExtraction(text: string) {
  const pages = splitPages(text);
  const headerSource = pages[0] || text;
  const header = extractBriefHeaderFromPreview(headerSource);
  const tasks = extractBriefTasks(text, pages);
  const criteriaPage = pages[8] || "";
  const criteriaRefs = criteriaPage ? extractCriteriaRefs(criteriaPage) : [];
  const loHeaders = criteriaPage ? extractLoHeaders(criteriaPage) : [];

  return {
    pageCount: pages.length,
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
    criteriaRefs,
    loHeaders,
  };
}
