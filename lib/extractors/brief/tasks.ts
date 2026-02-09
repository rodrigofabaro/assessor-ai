import { normalizeWhitespace } from "../common";
import { extractEndMatterBlocks, getEndMatterKey } from "./endMatter";
import type { BriefTask, BriefTasksResult } from "./types";
import { splitLines } from "./utils";

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

export function extractBriefTasks(text: string, pages: string[]): BriefTasksResult {
  const warnings: string[] = [];
  const sourcePages = pages.length ? pages : [text];
  const cleanedPages = sourcePages.map((pageText) => {
    const lines = stripFooterLines(splitLines(pageText));
    return lines.join("\n");
  });
  const linesWithPages: Array<{ line: string; page: number }> = [];
  const endMatter = extractEndMatterBlocks(cleanedPages);

  const normalizeLine = (line: string) => line.replace(/\s+/g, " ").trim();

  let stop = false;
  cleanedPages.forEach((pageText, idx) => {
    if (stop) return;
    const pageNumber = pages.length ? idx + 1 : 1;
    const lines = splitLines(pageText);
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
      let normalizedLine = normalizeLine(lines[lineIdx]);
      if (getEndMatterKey(normalizedLine)) {
        stop = true;
        break;
      }

      const nextLine = lines[lineIdx + 1] ? normalizeLine(lines[lineIdx + 1]) : "";
      const isTaskWordOnly =
        /^task$/i.test(normalizedLine) ||
        (/\bt\s*a\s*s\s*k\b/i.test(normalizedLine) && !/\bt\s*a\s*s\s*k\s*\d/i.test(normalizedLine));
      if (isTaskWordOnly && nextLine && /^\d{1,2}\b/.test(nextLine)) {
        normalizedLine = `Task ${nextLine}`.trim();
        linesWithPages.push({ line: normalizedLine, page: pageNumber });
        lineIdx += 1;
        continue;
      }

      linesWithPages.push({ line: normalizedLine, page: pageNumber });
    }
  });

  const parseHeading = (raw: string) => {
    if (!raw) return null;
    const match = raw.match(/^\s*[^A-Za-z0-9]{0,3}Task\s*(\d{1,2})\b/i);
    if (!match) return null;
    const n = Number(match[1]);
    if (!n || Number.isNaN(n)) return null;
    const idx = match.index ?? 0;
    const remainder = raw.slice(idx + match[0].length);
    const cleanedRemainder = remainder
      .replace(/^\s*\(.*?\)\s*/i, "")
      .replace(/^\s*[:\-–—]\s*/i, "")
      .trim();
    const title = cleanedRemainder ? normalizeWhitespace(cleanedRemainder) : null;
    return { n, title };
  };

  let startIndex = 0;
  for (let i = 0; i < linesWithPages.length; i += 1) {
    const h = parseHeading(linesWithPages[i].line);
    if (h?.n === 1) {
      startIndex = Math.max(0, i - 10);
      break;
    }
  }

  const headings: Array<{ index: number; n: number; title?: string | null; page: number }> = [];
  for (let i = startIndex; i < linesWithPages.length; i += 1) {
    const raw = linesWithPages[i].line;
    const heading = parseHeading(raw);
    if (!heading) continue;
    headings.push({ index: i, n: heading.n, title: heading.title, page: linesWithPages[i].page });
  }

  if (!headings.length) {
    warnings.push("Task headings not found (expected “Task 1”, “Task 2”, …).");
    return { tasks: [], warnings, endMatter };
  }

  const orderedHeadings: Array<{ index: number; n: number; title?: string | null; page: number }> = [];
  const seen = new Set<number>();
  let lastN = 0;
  for (const heading of headings) {
    if (seen.has(heading.n)) continue;
    if (heading.n < lastN) continue;
    seen.add(heading.n);
    orderedHeadings.push(heading);
    lastN = heading.n;
  }

  const tasks: BriefTask[] = [];

  const firstHeading = orderedHeadings[0];
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

  orderedHeadings.forEach((heading, idx) => {
    const start = heading.index + 1;
    const end = idx + 1 < orderedHeadings.length ? orderedHeadings[idx + 1].index : linesWithPages.length;
    const bodyLines = cleanTaskLines(linesWithPages.slice(start, end).map((l) => l.line));
    let textBody = bodyLines.join("\n");
    textBody = textBody.replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "");

    const taskWarnings: string[] = [];
    if (!textBody.trim()) {
      const fallback = heading.title ? `Task ${heading.n} — ${heading.title}` : `Task ${heading.n}`;
      textBody = fallback;
      taskWarnings.push("task body: empty");
    }

    const previewLines = linesWithPages
      .slice(heading.index, Math.min(heading.index + 6, linesWithPages.length))
      .map((l) => l.line);
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
      confidence: taskWarnings.length ? "HEURISTIC" : "CLEAN",
    });
  });

  return { tasks, warnings, endMatter };
}
