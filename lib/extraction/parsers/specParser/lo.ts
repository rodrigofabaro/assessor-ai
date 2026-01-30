import { normalizeWhitespace, toLines } from "@/lib/extraction/normalize/text";
import type { LearningOutcome } from "./types";

/**
 * Extract LO headers (LO1..).
 * Uses a line-based approach because PDF table flattening is inconsistent.
 */
export function parseLearningOutcomes(text: string): Omit<LearningOutcome, "criteria">[] {
  const lines = toLines(text);

  const out: Array<Omit<LearningOutcome, "criteria">> = [];

  for (const raw of lines) {
    // Fix common flattening: "LO1Describe" -> "LO1 Describe"
    const l = raw.replace(/\b(LO\d{1,2})(?=[A-Za-z])/g, "$1 ").trim();

    const m = l.match(/^\s*(LO\d{1,2})\b\s*[:\-–]?\s*(.+)$/i);
    if (!m) continue;

    const loCode = m[1].toUpperCase();
    const desc = normalizeWhitespace(m[2] || "");
    if (!desc) continue;

    if (out.some((x) => x.loCode === loCode)) continue;

    out.push({
      loCode,
      description: desc,
      essentialContent: null,
    });
  }

  // Sort LO1..LO10
  out.sort((a, b) => {
    const an = parseInt(a.loCode.replace(/\D/g, ""), 10) || 0;
    const bn = parseInt(b.loCode.replace(/\D/g, ""), 10) || 0;
    return an - bn;
  });

  return out;
}
