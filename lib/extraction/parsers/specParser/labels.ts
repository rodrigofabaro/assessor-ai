import { normalizeWhitespace, toLines, firstMatch } from "@/lib/extraction/normalize/text";

const ISSUE_LABEL_RE = /Issue\s+\d+\s*[–-]\s*[A-Za-z]+\s+\d{4}/gi;

function splitPages(text: string): string[] {
  return String(text || "")
    .split(/\f+/)
    .map((page) => page.trim())
    .filter(Boolean);
}

function pickMostFrequent(matches: string[]): string {
  const counts = new Map<string, number>();
  for (const raw of matches) {
    const key = normalizeWhitespace(raw);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let best = "";
  let bestCount = 0;
  for (const [label, count] of counts.entries()) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Pulls Issue label like:
 * "Issue 5 – June 2025" / "Issue 4 - March 2024"
 */
export function parseIssueLabel(text: string): string {
  const t = text || "";

  const pages = splitPages(t);
  const fastPathText = pages.slice(0, 2).join("\n");
  const fastMatches = fastPathText.match(ISSUE_LABEL_RE) || [];

  const allMatches = fastMatches.length > 0 ? fastMatches : t.match(ISSUE_LABEL_RE) || [];
  const frequent = pickMostFrequent(allMatches);
  if (frequent) return frequent;

  const m = firstMatch(t, /\bIssue\s*\d+\b/i);
  return normalizeWhitespace(m || "");
}

/**
 * Resolve the 4-digit unit code.
 * Attempts: (1) from text patterns, (2) from fallback doc title/filename.
 */
export function parseUnitCode(text: string, docTitleFallback: string): string {
  const t = text || "";

  // Common: "Unit 4014" somewhere in header
  const a = firstMatch(t, /\bUnit\s+(\d{4})\b/i);
  if (a) return String(a).replace(/\D/g, "").slice(0, 4);

  // Sometimes the filename/title has the 4-digit code
  const fb = docTitleFallback || "";
  const b = firstMatch(fb, /\b(\d{4})\b/);
  if (b) return String(b).replace(/\D/g, "").slice(0, 4);

  return "";
}

/**
 * Pearson sometimes includes other unit identifiers. Keep the export stable.
 * For now, return the same 4-digit unit code if present (safe + deterministic).
 */
export function parsePearsonUnitCode(text: string): string {
  const t = text || "";
  const code = firstMatch(t, /\bUnit\s+(\d{4})\b/i);
  return normalizeWhitespace(code || "");
}

/**
 * Extract a numeric value for a labelled meta field (e.g. Level, Credits).
 *
 * Examples it handles:
 * - "Level 4"
 * - "Level: 4"
 * - "Credits 15"
 * - "Credits: 15"
 */
export function parseMetaNumber(text: string, label: string | RegExp): number | null {
  const t = text || "";
  const labelRe = typeof label === "string" ? new RegExp(`\\b${label}\\b`, "i") : label;

  // Try line-based first (more reliable on PDF-flattened text)
  const lines = toLines(t);
  for (const line of lines.slice(0, 200)) {
    if (!labelRe.test(line)) continue;
    const m = line.match(/\b(\d{1,3})\b/);
    if (m) return Number(m[1]);
  }

  // Fallback: full-text pattern "Label ... number"
  const mm = t.match(new RegExp(`${labelRe.source}[^0-9]{0,10}(\\d{1,3})`, "i"));
  if (mm && mm[1]) return Number(mm[1]);

  return null;
}

/**
 * Extract a reliable unit title line(s) near the "Unit XXXX" header.
 */
export function parseUnitTitle(text: string, docTitleFallback: string): string {
  const t = text || "";
  const lines = toLines(t);

  // Use the same unit code logic you already trust
  const code = parseUnitCode(t, docTitleFallback);
  const codeRe = code ? new RegExp(`\\bUnit\\s+${code}\\b`, "i") : /\bUnit\s+\d{4}\b/i;

  // Stop markers: once we hit these, we’ve left the header/title area
  const stopRe =
    /(engineering suite|\u00a9|©|pearson|higher nationals|unit descriptor|learning outcomes|assessment criteria|level\b|credits\b|guided learning|summary of unit|essential content)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find the header line that starts the unit title
    if (!codeRe.test(line)) continue;

    // Remove "Unit 4014" and separators from this line, keep the rest as the first chunk
    const first = line
      .replace(codeRe, "")
      .replace(/^\s*[:\-–—]\s*/, "")
      .trim();

    const parts: string[] = [];
    if (first && !stopRe.test(first)) parts.push(first);

    // If the title wrapped, collect continuation lines
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const nxt = (lines[j] || "").trim();
      if (!nxt) break;
      if (stopRe.test(nxt)) break;

      // Avoid accidentally swallowing the issue label line or other metadata-ish lines
      if (/^issue\b/i.test(nxt)) break;

      parts.push(nxt);
    }

    const joined = normalizeWhitespace(parts.join(" "));
    if (joined) return joined;
  }

  // Fallback: classic single-line pattern
  const m = firstMatch(t, /Unit\s+\d{4}\s*[-–—:]\s*([^\n]+)/i);
  return normalizeWhitespace(m || "");
}
