import { normalizeWhitespace, toLines } from "@/lib/extraction/normalize/text";
import type { AssessmentCriterion, GradeBand } from "./types";
import { cleanTrailingPageNumber } from "@/lib/extraction/normalize/cleanTrailingPageNumber";

/**
 * Bulletproof-ish criteria parser:
 * - starts from "Learning Outcomes and Assessment Criteria"
 * - scans all following pages/lines (not first table only)
 * - detects LO blocks via headings like "Learning Outcome LO3" / "LO3"
 * - collects P/M/D criterion lines until next LO block
 * - stops at known major sections
 */

const SECTION_START_RE = /Learning Outcomes and Assessment Criteria/i;
const LO_HEADING_RE = /^\s*(?:Learning\s+Outcome\s+)?(LO\d{1,2})\b/i;
const MAJOR_SECTION_RE = /^\s*(Essential Content|Recommended Resources|Journals|Links|This unit links to)\b/i;

const FOOTER_NOISE_RE =
  /^\s*(?:Unit Descriptors for the Pearson BTEC Higher Nationals Engineering Suite|Issue\s+\d+|©\s*Pearson|Pearson Education|Education Limited|Page\s*\d+|\d{1,4})\b/i;

// OCR/flattening can produce tokens like "P10Investigate", "Pl0", "Ml", etc.
// Accept a compact token and normalize common OCR confusions (I/l -> 1, O -> 0).
const AC_TOKEN_RE = /\b([PMDpmd])\s*([0-9IlO]{1,2})(?=\b|[A-Za-z])/g;

function sliceCriteriaRegion(lines: string[]): string[] {
  const start = lines.findIndex((l) => SECTION_START_RE.test(l));
  const base = start >= 0 ? lines.slice(start) : lines;

  const end = base.findIndex((l) => MAJOR_SECTION_RE.test(l));
  return end >= 0 ? base.slice(0, end) : base;
}

function isHardStopHeading(line: string): boolean {
  return MAJOR_SECTION_RE.test(line);
}

function isFooterNoise(line: string): boolean {
  const l = String(line || "").trim();
  return !!l && FOOTER_NOISE_RE.test(l);
}

function stripPdfJunk(line: string): string {
  let s = (line || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";

  s = s.replace(/\b(?:page\s*)?\d{1,4}\s+pass\s+merit\s+distinction\b/gi, " ");
  s = s.replace(/\bpass\s+merit\s+distinction\b/gi, " ");

  s = s.replace(/\s+\d{1,4}\s*$/, "");

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
        if (m.index >= 25 && (cutAt === -1 || m.index < cutAt)) cutAt = m.index;
      }
    }
    if (cutAt > 0) s = s.slice(0, cutAt).trim();
  }

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

function normalizeCriterionDigits(rawDigits: string): string {
  return String(rawDigits || "")
    .replace(/[Il]/g, "1")
    .replace(/O/g, "0");
}

function buildCriterionCode(band: unknown, digits: unknown): string | null {
  const b = String(band || "").toUpperCase();
  if (!/[PMD]/.test(b)) return null;
  const d = normalizeCriterionDigits(String(digits || ""));
  if (!/^\d{1,2}$/.test(d)) return null;
  return `${b}${d}`;
}

function expandFlattenedCriteriaLine(raw: string): string[] {
  const line = String(raw || "");
  if (!line.trim()) return [line];

  const hits = Array.from(line.matchAll(AC_TOKEN_RE));
  if (!hits.length) return [line];

  const hasLoHeading = /\bLO\d{1,2}\b/i.test(line);
  const firstIdx = hits[0]?.index ?? -1;
  const shouldSplit = hits.length >= 2 || (hasLoHeading && firstIdx > 0);
  if (!shouldSplit) return [line];

  const out: string[] = [];
  let cursor = 0;
  for (const hit of hits) {
    const idx = hit.index ?? -1;
    if (idx < 0) continue;
    if (idx > cursor) {
      const prefix = line.slice(cursor, idx).trim();
      if (prefix) out.push(prefix);
    }
    cursor = idx;
  }
  if (cursor < line.length) {
    const tail = line.slice(cursor);
    const tailHits = Array.from(tail.matchAll(AC_TOKEN_RE));
    if (!tailHits.length) {
      out.push(tail.trim());
    } else {
      for (let i = 0; i < tailHits.length; i += 1) {
        const h = tailHits[i];
        const start = h.index ?? 0;
        const end = i + 1 < tailHits.length ? (tailHits[i + 1].index ?? tail.length) : tail.length;
        const chunk = tail.slice(start, end).trim();
        if (chunk) out.push(chunk);
      }
    }
  }
  return out.length ? out : [line];
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

    const desc = stripPdfJunk(descParts.join(" "));
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

  for (const lineRaw of lines) {
    const expanded = expandFlattenedCriteriaLine(String(lineRaw || ""));
    for (const raw of expanded) {
      const fixed = String(raw || "").trim().replace(/\b(LO\d{1,2})(?=[A-Za-z])/g, "$1 ");
      const l = stripPdfJunk(fixed);
      if (!l) continue;

      if (isFooterNoise(l)) continue;

      if (currentCode && isHardStopHeading(l)) {
        flush();
        break;
      }

      const loHeading = l.match(LO_HEADING_RE);
      if (loHeading) {
        const lo = loHeading[1].toUpperCase();
        if (wanted.has(lo)) {
          flush();
          currentLO = lo;
        }
      }

      const acHit = l.match(/^([PMDpmd])\s*([0-9IlO]{1,2})(?=\b|[A-Za-z])\s*(.*)$/);
      if (acHit) {
        const code = buildCriterionCode(acHit[1], acHit[2]);
        const rest = (acHit[3] || "").trim();

        if (!code || !currentLO || !wanted.has(currentLO)) continue;

        flush();
        currentCode = code;
        if (rest) descParts.push(rest);
        continue;
      }

      const loAndAcHit = l.match(/\b([Ll][Oo]\d{1,2})\b\s+([PMDpmd])\s*([0-9IlO]{1,2})(?=\b|[A-Za-z])\s*(.*)$/);
      if (loAndAcHit) {
        const lo = loAndAcHit[1].toUpperCase();
        const code = buildCriterionCode(loAndAcHit[2], loAndAcHit[3]);
        const rest = (loAndAcHit[4] || "").trim();

        if (!code || !wanted.has(lo)) continue;

        flush();
        currentLO = lo;
        currentCode = code;
        if (rest) descParts.push(rest);
        continue;
      }

      if (currentCode) {
        if (/^\s*(?:©\s*Pearson|Pearson Education|Education Limited)\b/i.test(l)) continue;
        if (/^\s*(?:page\s*)?\d{1,4}\s*$/i.test(l)) continue;
        descParts.push(l);
      }
    }
  }

  flush();

  for (const lo of Object.keys(byLo)) {
    byLo[lo].sort((a, b) => rank(a.acCode) - rank(b.acCode) || a.acCode.localeCompare(b.acCode));
  }

  return byLo;
}
