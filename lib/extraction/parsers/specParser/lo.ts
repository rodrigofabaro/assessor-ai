import { normalizeWhitespace, toLines } from "@/lib/extraction/normalize/text";
import type { LearningOutcome } from "./types";

/**
 * Extract LO headers + full description (multi-line).
 * Handles:
 * - "LO1 Describe..."
 * - "Learning Outcome 1" followed by description on same/next lines
 * - Wrapped LO descriptions across multiple lines
 */
export function parseLearningOutcomes(text: string): Omit<LearningOutcome, "criteria">[] {
  const lines = toLines(text);

  const out: Array<Omit<LearningOutcome, "criteria">> = [];

  // Match "LO1 ..." or "LO1: ..." (optionally with description)
  const LO_INLINE = /^\s*(LO\s*\d{1,2})\b\s*[:\-–]?\s*(.*)$/i;

  // Match "Learning Outcome 1" (optionally with trailing description)
  const LO_LONG = /^\s*Learning\s*Outcome\s*(\d{1,2})\b\s*[:\-–]?\s*(.*)$/i;

  // Headings that mean we're no longer in the LO description region
  const HARD_STOPS = [
    /^\s*Assessment\s*criteria\b/i,
    /^\s*Essential\s*content\b/i,
    /^\s*Learning\s*outcomes?\s*&?\s*criteria\b/i,
    /^\s*Pass\b/i,
    /^\s*Merit\b/i,
    /^\s*Distinction\b/i,
  ];

  const FOOTER_JUNK = [
  // Pearson copyright/footer lines (very common)
  /©\s*pearson/i,
  /pearson\s*education/i,
  /education\s*limited/i,

  // "Engineering Suite (2024) Issue 5 – June 2025" style
  /\bengineering\s*suite\b/i,
  /\bissue\s*\d+\b/i,

  // Page numbers at end (often "138" or "Page 138")
  /^\s*\d{1,4}\s*$/,
  /^\s*page\s*\d{1,4}\s*$/i,
];

function isFooterJunk(line: string) {
  const s = (line || "").trim();
  if (!s) return true;
  // Super-long single-line footers are often junk in PDFs
  if (s.length > 120 && /©|pearson|suite|issue/i.test(s)) return true;
  return FOOTER_JUNK.some((rx) => rx.test(s));
}


  function isHardStop(line: string) {
    return HARD_STOPS.some((rx) => rx.test(line));
  }

  function normalizeLoCode(raw: string) {
    const n = parseInt(raw.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? `LO${n}` : raw.toUpperCase().replace(/\s+/g, "");
  }

  let current: Omit<LearningOutcome, "criteria"> | null = null;

  function flush() {
    if (!current) return;
    current.description = normalizeWhitespace(current.description || "");
    if (current.description) {
      // Avoid duplicates (keep first)
      if (!out.some((x) => x.loCode === current!.loCode)) out.push(current);
    }
    current = null;
  }

  for (const raw of lines) {
    if (!raw) continue;

    // Fix common flattening: "LO1Describe" -> "LO1 Describe"
    const fixed = raw.replace(/\b(LO\d{1,2})(?=[A-Za-z])/g, "$1 ").trim();
    if (!fixed) continue;

    // If we hit a hard stop while capturing, flush and stop capturing until next LO
    if (current && isHardStop(fixed)) {
      flush();
      continue;
    }

    // Detect LO heading (short form)
    const m1 = fixed.match(LO_INLINE);
    if (m1) {
      const loCode = normalizeLoCode(m1[1]);
      const rest = normalizeWhitespace(m1[2] || "");

      // New LO starts -> flush previous
      if (current) flush();

      current = {
        loCode,
        description: rest || "",
        essentialContent: null,
      };
      continue;
    }

    // Detect LO heading (long form)
    const m2 = fixed.match(LO_LONG);
    if (m2) {
      const loCode = `LO${parseInt(m2[1], 10)}`;
      const rest = normalizeWhitespace(m2[2] || "");

      if (current) flush();

      current = {
        loCode,
        description: rest || "",
        essentialContent: null,
      };
      continue;
    }

    // Accumulate continuation lines into current LO description
    if (current) {
    const maybe = normalizeWhitespace(fixed);
    if (!maybe) continue;

   // ✅ Skip PDF footer / copyright / page-number noise
    if (isFooterJunk(maybe)) continue;

    current.description += (current.description ? " " : "") + maybe;
}

  }

  // Flush final LO
  flush();

  // Sort LO1..LO10
  out.sort((a, b) => {
    const an = parseInt(a.loCode.replace(/\D/g, ""), 10) || 0;
    const bn = parseInt(b.loCode.replace(/\D/g, ""), 10) || 0;
    return an - bn;
  });

  return out;
}
