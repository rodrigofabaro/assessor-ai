import { firstMatch, normalizeWhitespace } from "@/lib/extraction/normalize/text";

export function parseIssueLabel(text: string): string | null {
  // Common Pearson form: "Issue 5 – June 2024".
  return (
    firstMatch(text, /\b(Issue\s+\d+\s*[–-]\s*[A-Za-z]+\s+\d{4})\b/i) ||
    firstMatch(text, /\b(Issue\s+\d+)\b/i)
  );
}

export function parseUnitCode(text: string, docTitleFallback: string): string {
  return (
    firstMatch(text, /\bUnit\s+(4\d{3})\b/i) || firstMatch(docTitleFallback, /\b(4\d{3})\b/i) || ""
  );
}

export function parseUnitTitle(text: string, docTitleFallback: string): string {
  let unitTitle =
    firstMatch(text, /\bUnit\s+4\d{3}\s*[:\-]\s*([^\n]+)\n/i) ||
    firstMatch(text, /\bUnit\s+4\d{3}\s*[:\-]\s*([^\n]+)\r?\n/i);

  if (unitTitle) {
    unitTitle = unitTitle.replace(/\s{2,}/g, " ").trim();
  } else {
    const titleFromDoc = docTitleFallback || "";
    const m = titleFromDoc.match(/\bUnit\s+4\d{3}\s*[-:]\s*(.+?)(?:\s*-\s*-–?\s*Issue|\s*-–?\s*Issue|\s*Issue|\s*$)/i);
    if (m?.[1]) unitTitle = normalizeWhitespace(m[1]);
  }

  return unitTitle || "";
}

export function parseMetaNumber(text: string, label: string): number | null {
  const m = firstMatch(text, new RegExp(`\\b${label}:\\s*([0-9]+)\\b`, "i"));
  return m ? Number(m) : null;
}

export function parsePearsonUnitCode(text: string): string | null {
  return firstMatch(text, /\bUnit\s+Code:\s*([A-Z0-9/]+)\b/i);
}
