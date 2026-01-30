/**
 * Essential Content extractor for Pearson Unit Descriptor PDFs.
 *
 * Goal: pull ONLY the "Essential Content" guidance text, per LO,
 * and NEVER swallow assessment criteria (P/M/D codes), page footers, or other sections.
 *
 * Usage (minimal wiring):
 *   const loCodes = learningOutcomes.map(x => x.loCode);
 *   const essentialByLo = extractEssentialContentByLO(fullText, loCodes);
 *   for (const lo of learningOutcomes) lo.essentialContent = essentialByLo[lo.loCode] ?? null;
 */

import { cleanTrailingPageNumber } from "@/lib/extraction/normalize/cleanTrailingPageNumber";

function normalizeWhitespace(s: string) {
  return (s || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

function toLines(text: string): string[] {
  return (text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function sliceEssentialRegion(lines: string[]): string[] {
  const startIdx = lines.findIndex((l) => /^Essential\s+Content\b/i.test(l));
  if (startIdx < 0) return [];

  const base = lines.slice(startIdx + 1); // skip the heading line itself

  const endMarkers: RegExp[] = [
    /^Recommended Resources\b/i,
    /^Journals\b/i,
    /^Links\b/i,
    /^This unit links to\b/i,
    /^Assessment\b/i, // defensive
    /^Learning Outcomes and Assessment Criteria\b/i, // defensive
  ];

  let end = -1;
  for (const re of endMarkers) {
    const idx = base.findIndex((l) => re.test(l));
    if (idx >= 0 && (end < 0 || idx < end)) end = idx;
  }

  return end >= 0 ? base.slice(0, end) : base;
}

function isJunkLine(l: string) {
  return /^(Unit Descriptors|Issue\s+\d+|©\s*Pearson|Pearson Education|Page\s+\d+)/i.test(l);
}

function isCriterionLine(l: string) {
  // P8, P 8, M5, D4 etc (criteria should NOT appear in essential content)
  return /^\s*[PMD]\s*\d{1,2}\b/i.test(l);
}

/**
 * Extract essential guidance per LO (LO1..LO4 etc) from the Essential Content section only.
 */
export function extractEssentialContentByLO(fullText: string, loCodes: string[]) {
  const lines = sliceEssentialRegion(toLines(fullText));

  const out: Record<string, string> = {};
  for (const lo of loCodes) out[lo] = "";

  let currentLO: string | null = null;
  let parts: string[] = [];

  const flush = () => {
    if (!currentLO) {
      parts = [];
      return;
    }
    const txt = cleanTrailingPageNumber(normalizeWhitespace(parts.join(" ")));
    if (txt) {
      // cap to keep DB + UI tidy; adjust if you want more
      out[currentLO] = txt.slice(0, 2000);
    }
    parts = [];
  };

  for (const raw of lines) {
    const l0 = raw.trim();
    if (!l0) continue;
    if (isJunkLine(l0)) continue;

    // normalize PDF-flattened LO tokens like "LO1Describe" -> "LO1 Describe"
    const l = l0.replace(/\b(LO\d{1,2})(?=[A-Za-z])/g, "$1 ");

    // If we see criteria lines inside essential content, ignore them (and don't let them pollute).
    if (isCriterionLine(l)) continue;

    // Start/switch LO block: allow "LO1 ..." or just "LO1"
    const loHit = l.match(/^\s*(LO\d{1,2})\b/i) || l.match(/\b(LO\d{1,2})\b/i);
    if (loHit) {
      const lo = loHit[1].toUpperCase();
      if (loCodes.includes(lo)) {
        if (currentLO && lo !== currentLO) flush();
        currentLO = lo;

        // If there is trailing text on same line after LOx, treat it as content (often a subheading)
        const trailing = normalizeWhitespace(l.replace(new RegExp(`^\\s*${lo}\\b[:\\-–]?\\s*`, "i"), ""));
        if (trailing && !isCriterionLine(trailing)) parts.push(trailing);
        continue;
      }
    }

    // Only accumulate content after we've entered an LO block
    if (!currentLO) continue;

    // Defensive stop if another major heading sneaks in
    if (/^(Recommended Resources|Journals|Links|This unit links to|Learning Outcomes and Assessment Criteria)\b/i.test(l)) {
      break;
    }

    parts.push(l);
  }

  flush();

  // convert empty strings to undefined-like by leaving them empty; caller can set null
  return out;
}
