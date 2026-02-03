import { normalizeWhitespace, toLines } from "@/lib/extraction/normalize/text";
import type { AssessmentCriterion, GradeBand } from "./types";
import { cleanTrailingPageNumber } from "@/lib/extraction/normalize/cleanTrailingPageNumber";

/**
 * Bulletproof-ish criteria parser:
 * - Slices to LO/AC region
 * - Keeps real text even when footer junk is glued to the end of a line
 * - Stops before Essential Content / Recommended Resources, etc.
 * - Handles: "LO1 P1 ..." , "P1 ..." on next line, wrapped lines, LO switches mid-stream
 * - De-dupes by acCode per LO
 * - Sorts P1..P99, M1.., D1..
 */

function sliceCriteriaRegion(lines: string[]): string[] {
  // Prefer official heading when present
  const start = lines.findIndex((l) => /Learning Outcomes and Assessment Criteria/i.test(l));
  const base = start >= 0 ? lines.slice(start) : lines;

  // End at the earliest known heading that follows the criteria block
  const endMarkers: RegExp[] = [
    /^\s*Essential Content\b/i,
    /^\s*Recommended Resources\b/i,
    /^\s*Journals\b/i,
    /^\s*Links\b/i,
    /^\s*This unit links to\b/i,
    /^\s*Unit Descriptors\b/i,
  ];

  let end = -1;
  for (const rx of endMarkers) {
    const idx = base.findIndex((l) => rx.test(l));
    if (idx >= 0 && (end < 0 || idx < end)) end = idx;
  }

  return end >= 0 ? base.slice(0, end) : base;
}

function isHardStopHeading(line: string): boolean {
  return (
    /^\s*(Essential Content|Recommended Resources|Journals|Links|This unit links to|Unit Descriptors)\b/i.test(line)
  );
}

/**
 * Remove common PDF footer/header junk WITHOUT deleting real content.
 * Key rule: clean the string; don't "skip the whole line" just because it contains junk.
 */
function stripPdfJunk(line: string): string {
  let s = (line || "")
    // Remove control chars
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";

  // Remove common glued footer sequence: "142 Pass Merit Distinction" or "Page 142 Pass Merit Distinction"
  s = s.replace(/\b(?:page\s*)?\d{1,4}\s+pass\s+merit\s+distinction\b/gi, " ");
  s = s.replace(/\bpass\s+merit\s+distinction\b/gi, " ");

  // Remove lone page number at end (only when it looks like a trailing artefact)
  s = s.replace(/\s+\d{1,4}\s*$/, (m) => {
    const n = m.trim();
    // If the whole line is just a number, keep as empty; otherwise drop the tail number
    return /^\d{1,4}$/.test(n) ? "" : "";
  });

  // If footer markers appear late in a long line, cut from marker to end (keeps real content earlier)
  // This avoids nuking legitimate content where "Pearson" appears early.
  if (s.length > 80) {
    const markers: RegExp[] = [
      /\bengineering\s*suite\b/i,
      /\bissue\s*\d+\b/i,
      /©/i,
      /\bpearson\b/i,
      /\beducation\s*limited\b/i,
      /\bpearson\s*education\b/i,
    ];

    let cutAt = -1;
    for (const rx of markers) {
      const m = s.match(rx);
      if (m && typeof m.index === "number") {
        // only cut if marker is not near the start (footer-like)
        if (m.index >= 25 && (cutAt === -1 || m.index < cutAt)) cutAt = m.index;
      }
    }
    if (cutAt > 0) s = s.slice(0, cutAt).trim();
  }

  // Final normalisation + trailing page number clean (belt and braces)
  s = normalizeWhitespace(s);
  s = cleanTrailingPageNumber(s);
  s = normalizeWhitespace(s);

  return s.trim();
}

function bandRankFromCode(code: string) {
  const c = (code || "").toUpperCase();
  if (c.startsWith("P")) return 0;
  if (c.startsWith("M")) return 100;
  if (c.startsWith("D")) return 200;
  return 999;
}

function codeNumber(code: string) {
  const m = String(code || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function rank(acCode: string) {
  return bandRankFromCode(acCode) + codeNumber(acCode);
}

function gradeBandFor(code: string): GradeBand {
  const c = (code || "").toUpperCase();
  if (c.startsWith("P")) return "PASS";
  if (c.startsWith("M")) return "MERIT";
  return "DISTINCTION";
}

export function parseCriteriaByLO(text: string, loCodes: string[]) {
  const wanted = new Set((loCodes || []).map((x) => String(x).toUpperCase()));
  const lines = sliceCriteriaRegion(toLines(text));

  const byLo: Record<string, AssessmentCriterion[]> = {};
  for (const lo of wanted) byLo[lo] = [];

  let currentLO: string | null = null;
  let currentCode: string | null = null;
  let descParts: string[] = [];

  const flush = () => {
    if (!currentLO || !currentCode) {
      currentCode = null;
      descParts = [];
      return;
    }

    let desc = stripPdfJunk(descParts.join(" "));
    if (!desc) {
      currentCode = null;
      descParts = [];
      return;
    }

    const arr = byLo[currentLO] || (byLo[currentLO] = []);
    if (!arr.some((c) => c.acCode === currentCode)) {
      arr.push({
        acCode: currentCode,
        gradeBand: gradeBandFor(currentCode),
        description: desc,
      });
    }

    currentCode = null;
    descParts = [];
  };

  for (const raw of lines) {
    // Fix common flattening: "LO1Describe" -> "LO1 Describe"
    const fixed = String(raw || "").trim().replace(/\b(LO\d{1,2})(?=[A-Za-z])/g, "$1 ");
    let l = stripPdfJunk(fixed);
    if (!l) continue;

    // If we hit an end heading while accumulating a criterion, flush and STOP (prevents swallow)
    if (currentCode && isHardStopHeading(l)) {
      flush();
      break;
    }

    // LO switch at start of line (common in flattened tables)
    const loSwitch = l.match(/^\s*(LO\d{1,2})\b/i);
    if (loSwitch) {
      const lo = loSwitch[1].toUpperCase();
      if (wanted.has(lo)) {
        // If we're mid-criterion, flush it before switching LO
        if (currentCode) flush();
        currentLO = lo;
        // Don't continue; the same line might also contain a criterion code (LO1 P1 ...)
        // so we fall through to AC detection.
      }
    }

    // AC detection:
    // - "P1 ..." at start
    // - "LO1 P1 ..." anywhere
    const acHit = l.match(/(?:^|\bLO\d{1,2}\b\s+)([PMD])\s*(\d{1,2})\b\s*(.*)$/i);
    if (acHit) {
      const code = (acHit[1].toUpperCase() + acHit[2]) as string;
      const rest = (acHit[3] || "").trim();

      // If there is an LO token in the line, prefer that LO as currentLO
      const embeddedLo = l.match(/\b(LO\d{1,2})\b/i);
      if (embeddedLo) {
        const lo = embeddedLo[1].toUpperCase();
        if (wanted.has(lo)) currentLO = lo;
      }

      // If we still have no LO context, ignore (avoids false positives elsewhere)
      if (!currentLO || !wanted.has(currentLO)) continue;

      flush();
      currentCode = code;
      if (rest) descParts.push(rest);
      continue;
    }

    // Continuation line for current criterion
    if (currentCode) {
      // If a new LO starts on this line, flush and switch (rare but happens)
      const loStart = l.match(/^\s*(LO\d{1,2})\b/i);
      if (loStart) {
        const lo = loStart[1].toUpperCase();
        if (wanted.has(lo)) {
          flush();
          currentLO = lo;
          continue;
        }
      }

      // Ignore repeated header-ish noise lines only if they look like pure boilerplate
      if (/^\s*(?:©\s*Pearson|Pearson Education|Education Limited)\b/i.test(l)) continue;
      if (/^\s*(?:page\s*)?\d{1,4}\s*$/i.test(l)) continue;

      descParts.push(l);
    }
  }

  flush();

  // Sort within each LO: P then M then D, numeric within band
  for (const lo of Object.keys(byLo)) {
    byLo[lo].sort((a, b) => rank(a.acCode) - rank(b.acCode) || a.acCode.localeCompare(b.acCode));
  }

  return byLo;
}
