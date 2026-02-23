import { normalizeWhitespace, toLines } from "@/lib/extraction/normalize/text";
import type { LearningOutcome } from "./types";

/**
 * Extract LO headers + full description (multi-line).
 * Handles:
 * - "LO1 Describe..."
 * - "Learning Outcome 1" (same/next lines)
 * - Wrapped LO descriptions across multiple lines
 * - Footer/copyright/page-number noise (common in Pearson PDFs)
 */
export function parseLearningOutcomes(text: string): Omit<LearningOutcome, "criteria">[] {
  const lines = toLines(text);
  const out: Array<Omit<LearningOutcome, "criteria">> = [];

  const LO_INLINE = /^\s*(LO\s*\d{1,2})\b\s*[:\-–]?\s*(.*)$/i;
  const LO_LONG = /^\s*Learning\s*Outcome\s*(\d{1,2})\b\s*[:\-–]?\s*(.*)$/i;

  const HARD_STOPS = [
    /^\s*Assessment\s*criteria\b/i,
    /^\s*Essential\s*content\b/i,
    /^\s*Pass\b/i,
    /^\s*Merit\b/i,
    /^\s*Distinction\b/i,
  ];

  const CRITERION_LINE_RX = /^\s*[PMDpmd]\s*[0-9IlO]{1,2}\b/;

  // Standalone footer lines we can safely ignore
  const FOOTER_LINE_RX = [
    /©\s*pearson/i,
    /\bpearson\s*btec\b/i,
    /\bpearson\s*education\b/i,
    /\beducation\s*limited\b/i,
    /\bhigher\s*nationals?\b/i,
    /\bengineering\s*suite\b/i,
    /\blearning\s*outcomes?\s*(?:&|and)?\s*assessment\s*criteria\b/i,
    /\bissue\s*\d+\b/i,
    /^\s*\d{1,4}\s*$/i,
    /^\s*page\s*\d{1,4}\s*$/i,
  ];

  // Markers that frequently appear mid-line when a footer gets flattened into content
  const FOOTER_TAIL_MARKERS = [
    /\bpearson\s*btec\b/i,
    /\bengineering\s*suite\b/i,
    /\bhigher\s*nationals?\b/i,
    /\blearning\s*outcomes?\s*(?:&|and)?\s*assessment\s*criteria\b/i,
    /\bpass\s+merit\s+distinction\b/i,
    /\bissue\s*\d+\b/i,
    /©/i,
    /\bpearson\b/i,
  ];

  function isHardStop(line: string) {
    return HARD_STOPS.some((rx) => rx.test(line));
  }

  function isCriterionLine(line: string) {
    return CRITERION_LINE_RX.test(String(line || "").trim());
  }

  function normalizeLoCode(raw: string) {
    const n = parseInt(raw.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? `LO${n}` : raw.toUpperCase().replace(/\s+/g, "");
  }

  function isFooterLine(line: string) {
    const s = (line || "").trim();
    if (!s) return true;
    if (s.length > 140 && /©|pearson|suite|issue/i.test(s)) return true;
    return FOOTER_LINE_RX.some((rx) => rx.test(s));
  }

  function stripFooterTail(s: string) {
    let t = (s || "").trim();
    if (!t) return "";

    // find earliest marker position (if any) and cut it off
    let cutAt = -1;
    for (const rx of FOOTER_TAIL_MARKERS) {
      const m = t.match(rx);
      if (m && typeof m.index === "number") {
        if (cutAt === -1 || m.index < cutAt) cutAt = m.index;
      }
    }
    if (cutAt > 0) t = t.slice(0, cutAt).trim();

    // remove trailing page number if it survived at the end
    t = t.replace(/\s+\d{1,4}\s*$/, "").trim();

    return t;
  }

  function cleanLoDescriptionFinal(s: string) {
    let t = normalizeWhitespace(stripFooterTail(s || ""));
    t = t
      .replace(/\bLearning\s*Outcomes?\s*(?:&|and)?\s*Assessment\s*Criteria\b\s*$/i, "")
      .replace(/\bPass\s+Merit\s+Distinction\b\s*$/i, "")
      .trim();
    return t;
  }

  function loDescriptionScore(s: string) {
    const t = normalizeWhitespace(s || "");
    if (!t) return -9999;
    let score = 0;
    const len = t.length;
    if (len >= 25 && len <= 220) score += 40;
    else if (len <= 320) score += 15;
    else score -= Math.min(120, Math.floor((len - 320) / 10));
    if (/:/.test(t)) score -= 25; // essential-content style subheadings often include colons
    if (/\bPearson\b|\bIssue\b|©|\bLearning\s*Outcomes?\b/i.test(t)) score -= 80;
    if (/\b(P|M|D)\s*\d{1,2}\b/.test(t)) score -= 60;
    const sentenceish = (t.match(/[.!?]/g) || []).length;
    if (sentenceish > 1) score -= 10 * (sentenceish - 1);
    score -= Math.max(0, Math.floor((len - 180) / 20));
    return score;
  }

  let current: Omit<LearningOutcome, "criteria"> | null = null;

  function flush() {
    if (!current) return;
    current.description = cleanLoDescriptionFinal(current.description || "");
    if (current.description) {
      const idx = out.findIndex((x) => x.loCode === current!.loCode);
      if (idx < 0) {
        out.push(current);
      } else {
        const existing = out[idx];
        if (loDescriptionScore(current.description) > loDescriptionScore(existing.description || "")) {
          out[idx] = current;
        }
      }
    }
    current = null;
  }

  for (const raw of lines) {
    if (!raw) continue;

    // Fix common flattening: "LO1Describe" -> "LO1 Describe"
    const fixed = raw.replace(/\b(LO\d{1,2})(?=[A-Za-z])/g, "$1 ").trim();
    if (!fixed) continue;

    if (current && isHardStop(fixed)) {
      flush();
      continue;
    }

    if (current && isCriterionLine(fixed)) {
      // In the assessment-criteria section, LO title ends before the first P/M/D row.
      flush();
      continue;
    }

    const m1 = fixed.match(LO_INLINE);
    if (m1) {
      const loCode = normalizeLoCode(m1[1]);
      const rest = normalizeWhitespace(stripFooterTail(m1[2] || ""));
      if (current) flush();
      current = { loCode, description: rest || "", essentialContent: null };
      continue;
    }

    const m2 = fixed.match(LO_LONG);
    if (m2) {
      const loCode = `LO${parseInt(m2[1], 10)}`;
      const rest = normalizeWhitespace(stripFooterTail(m2[2] || ""));
      if (current) flush();
      current = { loCode, description: rest || "", essentialContent: null };
      continue;
    }

    if (current) {
      let maybe = normalizeWhitespace(fixed);
      if (!maybe) continue;

      // If this is purely footer noise, skip it
      if (isFooterLine(maybe)) continue;

      // Otherwise strip footer tail if it’s appended mid-line
      maybe = normalizeWhitespace(stripFooterTail(maybe));
      if (!maybe) continue;

      current.description += (current.description ? " " : "") + maybe;
    }
  }

  flush();

  out.sort((a, b) => {
    const an = parseInt(a.loCode.replace(/\D/g, ""), 10) || 0;
    const bn = parseInt(b.loCode.replace(/\D/g, ""), 10) || 0;
    return an - bn;
  });

  return out;
}
