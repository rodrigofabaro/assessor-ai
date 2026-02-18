import { extractCriteriaCodesFromText, sortCriteriaCodes } from "@/lib/extraction/utils/criteriaCodes";
import type { GradeBand } from "@/lib/referenceParser";

type BriefLike = {
  criteriaCodes?: string[];
  criteriaRefs?: string[];
  detectedCriterionCodes?: string[];
  rawText?: string;
};

type UnitCriterionLite = {
  acCode: string;
  gradeBand: GradeBand;
  loCode: string;
};

function cleanCode(input: unknown): string {
  return String(input || "").trim().replace(/\s+/g, "").toUpperCase();
}

function numPart(code: string): number {
  const m = String(code || "").match(/(\d+)/);
  return m ? Number(m[1]) : 999;
}

function selectPreferredCodes(brief: BriefLike): string[] {
  const preferred =
    (Array.isArray(brief?.criteriaCodes) ? brief.criteriaCodes : []).length > 0
      ? brief.criteriaCodes || []
      : (Array.isArray(brief?.criteriaRefs) ? brief.criteriaRefs : []).length > 0
        ? brief.criteriaRefs || []
        : Array.isArray(brief?.detectedCriterionCodes)
          ? brief.detectedCriterionCodes || []
          : [];
  return Array.from(new Set(preferred.map(cleanCode).filter(Boolean)));
}

function markerArtifactCodes(rawText: string): Set<string> {
  const out = new Set<string>();
  const markers = String(rawText || "").match(/\[\[[^\]]+\]\]/g) || [];
  for (const marker of markers) {
    const hits = Array.from(marker.matchAll(/\b([PMD])\s*(\d+)\b/gi));
    for (const h of hits) out.add(`${String(h[1]).toUpperCase()}${Number(h[2])}`);
  }
  return out;
}

function stripTokenArtifactCodes(codes: string[], rawText: string): string[] {
  const normalizedCodes = Array.from(new Set((codes || []).map(cleanCode).filter(Boolean)));
  if (!normalizedCodes.length) return [];
  const src = String(rawText || "");
  if (!src.trim()) return normalizedCodes;
  const outsideText = src.replace(/\[\[[^\]]+\]\]/g, " ");
  const outsideCodes = new Set(extractCriteriaCodesFromText(outsideText).map(cleanCode));
  const artifacts = markerArtifactCodes(src);
  return normalizedCodes.filter((code) => !(artifacts.has(code) && !outsideCodes.has(code)));
}

function enrichLoProgression(codes: string[], unitCriteria: UnitCriterionLite[]): string[] {
  const byCode = new Map<string, UnitCriterionLite>();
  for (const c of unitCriteria || []) {
    const code = cleanCode(c.acCode);
    if (!code) continue;
    byCode.set(code, {
      acCode: code,
      gradeBand: c.gradeBand,
      loCode: cleanCode(c.loCode),
    });
  }
  const selected = new Set((codes || []).map(cleanCode).filter(Boolean));
  const selectedRows = Array.from(selected).map((code) => byCode.get(code)).filter(Boolean) as UnitCriterionLite[];
  const los = Array.from(new Set(selectedRows.map((r) => r.loCode).filter(Boolean)));
  const activeLos = new Set(
    selectedRows
      .filter((r) => r.gradeBand === "PASS" || r.gradeBand === "MERIT")
      .map((r) => r.loCode)
      .filter(Boolean)
  );
  let loGapDetected = false;
  for (const lo of los) {
    const loSelected = selectedRows.filter((r) => r.loCode === lo);
    const hasMerit = loSelected.some((r) => r.gradeBand === "MERIT");
    const hasDist = loSelected.some((r) => r.gradeBand === "DISTINCTION");
    if (!hasMerit || hasDist) continue;
    loGapDetected = true;
    const distCandidates = (unitCriteria || [])
      .filter((r) => cleanCode(r.loCode) === lo && r.gradeBand === "DISTINCTION")
      .sort((a, b) => numPart(a.acCode) - numPart(b.acCode));
    if (distCandidates.length) selected.add(cleanCode(distCandidates[0].acCode));
  }

  // If selection leaked a distinction from an unrelated LO (common OCR/code artifact),
  // keep distinctions aligned to active LOs once LO progression has been repaired.
  if (loGapDetected && activeLos.size > 0) {
    for (const code of Array.from(selected)) {
      const row = byCode.get(code);
      if (!row || row.gradeBand !== "DISTINCTION") continue;
      if (!activeLos.has(row.loCode)) selected.delete(code);
    }
  }
  return sortCriteriaCodes(Array.from(selected));
}

export function selectBriefMappingCodes(
  brief: BriefLike,
  unitCriteria?: UnitCriterionLite[]
): { selectedCodes: string[]; baseCodes: string[] } {
  const baseCodes = stripTokenArtifactCodes(selectPreferredCodes(brief), String(brief?.rawText || ""));
  const selectedCodes = unitCriteria?.length ? enrichLoProgression(baseCodes, unitCriteria) : sortCriteriaCodes(baseCodes);
  return { baseCodes: sortCriteriaCodes(baseCodes), selectedCodes };
}
