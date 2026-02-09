import { firstMatch, normalizeWhitespace } from "../common";
import { buildBriefTitle, extractBriefHeaderFromPreview } from "./header";
import { extractBriefTasks } from "./tasks";
import type { BriefHeader } from "./types";

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

function splitPages(text: string): string[] {
  const cleaned = (text || "").replace(/\r/g, "");
  const parts = cleaned.split(/\f|\u000c/);
  if (parts.length <= 1) return [cleaned];
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
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
  const codeGuess = assignmentNumber ? `A${assignmentNumber}` : t.match(/\bA\d+\b/i)?.[0]?.toUpperCase() ?? null;

  // Criteria codes: detect P/M/D numbers
  const codes = Array.from(t.toUpperCase().matchAll(/\b([PMD])\s*(\d{1,2})\b/g)).map((m) => `${m[1]}${m[2]}`);
  const detectedCriterionCodes = uniqSortedCodes(codes);

  const pages = splitPages(t);
  const headerSource = pages[0] || t.slice(0, 4500);
  const header = extractBriefHeaderFromPreview(headerSource);
  const tasksResult = extractBriefTasks(t, pages);
  const criteriaPage = pages[8] || "";
  const criteriaRefs = detectedCriterionCodes;
  const loHeaders = criteriaPage ? extractLoHeaders(criteriaPage) : [];

  const warnings = [...(header.warnings || []), ...(tasksResult.warnings || [])];
  const titleFromBody = assignmentTitle ? normalizeWhitespace(assignmentTitle) : null;
  const titleFromHeader = buildBriefTitle(header as BriefHeader, assignmentNumber, titleFromBody || fallbackTitle);

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
    endMatter: tasksResult.endMatter || null,
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
    endMatter: tasks.endMatter || null,
    criteriaRefs,
    loHeaders,
  };
}

export { extractBriefHeaderFromPreview } from "./header";
export type { BriefEndMatter, BriefHeader, BriefTask, BriefTasksResult } from "./types";
