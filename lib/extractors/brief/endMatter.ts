import type { BriefEndMatter } from "./types";
import { splitLines } from "./utils";

const END_MATTER_HEADINGS: Array<{ key: "sourcesBlock" | "criteriaBlock"; regex: RegExp }> = [
  { key: "sourcesBlock", regex: /^Sources\s+of\s+information/i },
  { key: "sourcesBlock", regex: /^Textbooks?/i },
  { key: "sourcesBlock", regex: /^Websites?/i },
  { key: "sourcesBlock", regex: /^Further\s+reading/i },
  { key: "sourcesBlock", regex: /^Additional\s+resources?/i },
  { key: "criteriaBlock", regex: /^Relevant Learning Outcomes/i },
  { key: "criteriaBlock", regex: /^Assessment Criteria/i },
  { key: "criteriaBlock", regex: /^Pass Merit Distinction/i },
];

export function getEndMatterKey(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return END_MATTER_HEADINGS.find(({ regex }) => regex.test(trimmed))?.key || null;
}

export function extractEndMatterBlocks(pages: string[]): BriefEndMatter | null {
  const blocks: Record<string, string[]> = {};
  let currentKey: "sourcesBlock" | "criteriaBlock" | null = null;

  pages.forEach((pageText) => {
    const lines = splitLines(pageText);
    lines.forEach((line) => {
      const key = getEndMatterKey(line);
      if (key) {
        currentKey = key;
        if (!blocks[currentKey]) blocks[currentKey] = [];
      }
      if (currentKey) {
        blocks[currentKey].push(line);
      }
    });
  });

  const sourcesBlock = blocks.sourcesBlock?.join("\n").trim() || null;
  const criteriaBlock = blocks.criteriaBlock?.join("\n").trim() || null;
  if (!sourcesBlock && !criteriaBlock) return null;
  return { sourcesBlock, criteriaBlock };
}
