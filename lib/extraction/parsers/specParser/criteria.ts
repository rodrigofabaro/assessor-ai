import { normalizeWhitespace, toLines } from "@/lib/extraction/normalize/text";
import type { AssessmentCriterion, GradeBand } from "./types";
    import { cleanTrailingPageNumber } from "@/lib/extraction/normalize/cleanTrailingPageNumber";


/**
 * Slice ONLY the LO/AC region to avoid criteria swallowing "Recommended Resources" etc.
 * Start: "Learning Outcomes and Assessment Criteria"
 * End: first match of one of the known section headings that follow criteria.
 */
function sliceCriteriaRegion(lines: string[]): string[] {
  const start = lines.findIndex((l) => /Learning Outcomes and Assessment Criteria/i.test(l));
  const base = start >= 0 ? lines.slice(start) : lines;

  const endMarkers: RegExp[] = [
    /^Essential Content\b/i,
    /^Recommended Resources\b/i,
    /^Journals\b/i,
    /^Links\b/i,
    /^This unit links to\b/i,
  ];

  let end = -1;
  for (const re of endMarkers) {
    const idx = base.findIndex((l) => re.test(l));
    if (idx >= 0 && (end < 0 || idx < end)) end = idx;
  }

  return end >= 0 ? base.slice(0, end) : base;
}

/**
 * Parse P/M/D criteria and assign to LO1/LO2/...
 * Works when tables get flattened and text wraps.
 */
export function parseCriteriaByLO(text: string, loCodes: string[]) {
  const lines = sliceCriteriaRegion(toLines(text));

  const byLo: Record<string, AssessmentCriterion[]> = Object.fromEntries(
    loCodes.map((lo) => [lo, []])
  );

  let currentLO: string | null = null;
  let currentCode: string | null = null;
  let descParts: string[] = [];

  const gradeBandFor = (code: string): GradeBand =>
    code.startsWith("P") ? "PASS" : code.startsWith("M") ? "MERIT" : "DISTINCTION";

  const isHardStopHeading = (l: string) =>
    /^(Essential Content|Recommended Resources|Journals|Links|This unit links to)\b/i.test(l);

  const flush = () => {
    if (!currentLO || !currentCode) {
      currentCode = null;
      descParts = [];
      return;
    }


const desc = cleanTrailingPageNumber(normalizeWhitespace(descParts.join(" ")));

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
    // Fix PDF flattening: "LO1Describe" -> "LO1 Describe" (removes the missing word boundary).
    const l = raw.trim().replace(/\b(LO\d{1,2})(?=[A-Za-z])/g, "$1 ");

    // If we ever hit a section heading while accumulating, STOP.
    if (currentCode && isHardStopHeading(l)) {
      flush();
      break;
    }

    // Update LO context (LO1, LO2 etc)
    const loHit = l.match(/\b(LO\d{1,2})\b/i);
    if (loHit) {
      const lo = loHit[1].toUpperCase();

      // LO and criterion on same line: "LO1 P1 Describe ..."
      const loAndCode = l.match(/\b(LO\d{1,2})\b.*?\b([PMD])\s*(\d{1,2})\b\s*(.*)$/i);
      if (loAndCode) {
        const lo2 = loAndCode[1].toUpperCase();
        const code = (loAndCode[2].toUpperCase() + loAndCode[3]) as string;
        const rest = (loAndCode[4] || "").trim();

        if (loCodes.includes(lo2)) {
          flush();
          currentLO = lo2;
          currentCode = code;
          if (rest) descParts.push(rest);
        }
        continue;
      }

      // LO header line
      if (loCodes.includes(lo)) {
        flush();
        currentLO = lo;
        continue;
      }
    }

    // Criterion code line: "P1 Describe..." / "M2 Analyse..."
    const codeHit = l.match(/^\s*([PMD])\s*(\d{1,2})\b\s*(.*)$/i);
    if (codeHit) {
      if (!currentLO) continue; // avoid false positives elsewhere
      flush();
      currentCode = (codeHit[1].toUpperCase() + codeHit[2]) as string;
      const rest = (codeHit[3] || "").trim();
      if (rest) descParts.push(rest);
      continue;
    }

    // Continuation line for current criterion
    if (currentCode) {
      // ignore repeated headers / page artifacts
      if (/^(Unit Descriptors|Issue\s+\d+|© Pearson|Pearson Education|Page\s+\d+)/i.test(l)) {
        continue;
      }

      // if we hit another LO label at the start of a line, flush and switch
      const loSwitch = l.match(/^\s*(LO\d{1,2})\b/i);
      if (loSwitch) {
        const lo = loSwitch[1].toUpperCase();
        if (loCodes.includes(lo)) {
          flush();
          currentLO = lo;
          continue;
        }
      }

      descParts.push(l);
    }
  }

  flush();

  // Sort P..M..D, numeric within band
  const rank = (ac: string) => {
    const band = ac[0];
    const num = parseInt(ac.slice(1), 10) || 0;
    const base = band === "P" ? 0 : band === "M" ? 100 : 200;
    return base + num;
  };
  for (const lo of Object.keys(byLo)) {
    byLo[lo].sort((a, b) => rank(a.acCode) - rank(b.acCode));
  }

  return byLo;
}
