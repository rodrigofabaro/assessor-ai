import { normalizeWhitespace, toLines } from "@/lib/extraction/normalize/text";
import { firstMatch } from "@/lib/extraction/normalize/text"; // keep if you still use it elsewhere
import { parseUnitCode } from "./labels"; // if circular, see note below

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
    let first = line
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

  // Fallback: try classic single-line pattern (your old approach)
  const m = firstMatch(t, /Unit\s+\d{4}\s*[-–—:]\s*([^\n]+)/i);
  return normalizeWhitespace(m || "");
}
