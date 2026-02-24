import type { GradeBand } from "@/lib/referenceParser";

export type BriefUnitCriterionAuditLite = {
  acCode: string;
  gradeBand: GradeBand;
  loCode: string;
  description?: string | null;
  loDescription?: string | null;
};

export type BriefSpecAuditFinding = {
  level: "BLOCKER" | "WARNING" | "INFO";
  code:
    | "UNIT_CODE_MISSING"
    | "UNIT_CODE_MISMATCH"
    | "UNIT_TITLE_MISSING"
    | "UNIT_TITLE_MISMATCH"
    | "UNIT_TITLE_DRIFT"
    | "LO_UNKNOWN"
    | "LO_MISSING_IN_BRIEF"
    | "LO_AC_MAPPING_MISMATCH"
    | "AC_TEXT_MISMATCH"
    | "AC_TEXT_MISSING";
  message: string;
  loCode?: string;
  acCode?: string;
  similarity?: number;
  briefValue?: string | null;
  specValue?: string | null;
};

export type BriefSpecAuditResult = {
  ok: boolean;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  findings: BriefSpecAuditFinding[];
  metrics: {
    specLoCount: number;
    briefLoCount: number;
    specCriteriaCount: number;
    briefCriteriaTextParsedCount: number;
    comparedCriteriaTextCount: number;
  };
};

type Input = {
  briefDraft: any;
  selectedUnitCode?: string | null;
  selectedUnitTitle?: string | null;
  unitCriteria: BriefUnitCriterionAuditLite[];
  selectedCodes?: string[];
};

function normalizeSpace(v: unknown) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function cleanCode(v: unknown) {
  const m = String(v || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .match(/^([PMD])(\d{1,2})$/);
  return m ? `${m[1]}${Number(m[2])}` : "";
}

function parseLoCodes(text: unknown): string[] {
  return Array.from(String(text || "").matchAll(/\bLO\s*([1-9]\d?)\b/gi)).map((m) => `LO${Number(m[1])}`);
}

function normalizeCompareText(text: unknown) {
  return normalizeSpace(text)
    .toLowerCase()
    .replace(/['`"]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(and|the|a|an|of|for|to|in|on|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: unknown): string[] {
  return normalizeCompareText(text)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function similarity(a: unknown, b: unknown): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  const union = new Set([...ta, ...tb]).size || 1;
  const jaccard = hit / union;
  const containment = hit / Math.max(1, Math.min(ta.size, tb.size));
  return Math.max(jaccard, containment * 0.85);
}

function parseBriefUnitHeader(draft: any): { unitCode: string | null; unitTitle: string | null } {
  const headerLine = normalizeSpace(draft?.header?.unitNumberAndTitle || "");
  if (!headerLine) {
    return { unitCode: draft?.unitCodeGuess ? String(draft.unitCodeGuess) : null, unitTitle: null };
  }
  const codeMatch = headerLine.match(/\bUnit\s*(\d{4})\b/i) || headerLine.match(/\b(\d{4})\b/);
  const unitCode = codeMatch?.[1] ? String(codeMatch[1]) : (draft?.unitCodeGuess ? String(draft.unitCodeGuess) : null);
  let unitTitle: string | null = null;
  if (unitCode) {
    unitTitle = normalizeSpace(
      headerLine
        .replace(/\bUnit\b/i, "")
        .replace(new RegExp(`\\b${unitCode}\\b`, "i"), "")
        .replace(/^[-:–\s]+/, "")
    ) || null;
  }
  return { unitCode, unitTitle };
}

function parseBriefCriterionTexts(draft: any): Map<string, { description: string; loCodes: Set<string> }> {
  const out = new Map<string, { description: string; loCodes: Set<string> }>();
  const source = normalizeSpace(draft?.endMatter?.criteriaBlock || "");
  if (!source) return out;

  const lines = String(draft?.endMatter?.criteriaBlock || "")
    .split(/\r?\n/)
    .map((l) => normalizeSpace(l))
    .filter(Boolean);

  let currentLos = new Set<string>();
  let currentCode = "";
  let currentParts: string[] = [];

  const flush = () => {
    if (!currentCode) return;
    const desc = normalizeSpace(currentParts.join(" "))
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
    if (desc) {
      const prev = out.get(currentCode);
      const loCodes = new Set<string>([...(prev?.loCodes || []), ...currentLos]);
      if (!prev || desc.length > prev.description.length) {
        out.set(currentCode, { description: desc, loCodes });
      } else {
        prev.loCodes = loCodes;
        out.set(currentCode, prev);
      }
    }
    currentCode = "";
    currentParts = [];
  };

  for (const line of lines) {
    if (/^relevant learning outcomes? and assessment criteria$/i.test(line)) continue;
    if (/^pass\s+merit\s+distinction$/i.test(line)) continue;
    if (/^(sources of information|textbooks?|websites?|journals?|recommended resources)\b/i.test(line)) break;

    const loCodes = parseLoCodes(line);
    if (loCodes.length) {
      if (!/^\s*LO\s*\d+\s*$/i.test(line) && !/^\s*(LO\s*\d+\s*)+$/i.test(line)) {
        // LO rows sometimes contain text; do not treat as criterion continuation.
      }
      currentLos = new Set(loCodes);
      // continue scanning same line for criteria if present
    }

    const codeMatches = Array.from(line.matchAll(/\b([PMD])\s*(\d{1,2})\b/gi));
    if (codeMatches.length) {
      // If a new code appears, split line into code+desc segments.
      const src = line;
      let cursor = 0;
      for (let i = 0; i < codeMatches.length; i += 1) {
        const m = codeMatches[i];
        const code = cleanCode(`${m[1]}${m[2]}`);
        if (!code) continue;
        const start = m.index ?? 0;
        const nextStart = codeMatches[i + 1]?.index ?? src.length;
        if (i === 0 && currentCode) flush();
        const segment = src.slice(start, nextStart);
        const segmentDesc = normalizeSpace(segment.replace(/^\s*[PMD]\s*\d{1,2}\b/i, ""));
        flush();
        currentCode = code;
        currentParts = segmentDesc ? [segmentDesc] : [];
        cursor = nextStart;
      }
      if (cursor >= src.length) continue;
    }

    if (currentCode && !loCodes.length) {
      const lineWithoutHeader = normalizeSpace(line.replace(/\bLO\s*[1-9]\d?\b/gi, ""));
      if (lineWithoutHeader) currentParts.push(lineWithoutHeader);
    }
  }
  flush();
  return out;
}

export function evaluateBriefSpecAudit(input: Input): BriefSpecAuditResult {
  const findings: BriefSpecAuditFinding[] = [];
  const briefDraft = input?.briefDraft || {};
  const selectedUnitCode = normalizeSpace(input?.selectedUnitCode || "");
  const selectedUnitTitle = normalizeSpace(input?.selectedUnitTitle || "");
  const unitCriteria = Array.isArray(input?.unitCriteria) ? input.unitCriteria : [];
  const selectedCodes = Array.from(new Set((input?.selectedCodes || []).map(cleanCode).filter(Boolean)));

  const unitByAc = new Map<string, BriefUnitCriterionAuditLite>();
  const specLoSet = new Set<string>();
  for (const c of unitCriteria) {
    const code = cleanCode(c.acCode);
    const loCode = normalizeSpace(c.loCode).toUpperCase();
    if (!code || !loCode) continue;
    unitByAc.set(code, c);
    specLoSet.add(loCode);
  }

  const briefUnit = parseBriefUnitHeader(briefDraft);
  const briefUnitCode = normalizeSpace(briefUnit.unitCode || briefDraft?.unitCodeGuess || "");
  const briefUnitTitle = normalizeSpace(briefUnit.unitTitle || "");

  if (!briefUnitCode) {
    findings.push({
      level: "INFO",
      code: "UNIT_CODE_MISSING",
      message: "Brief unit code was not confidently extracted from the brief.",
    });
  } else if (selectedUnitCode && briefUnitCode !== selectedUnitCode) {
    findings.push({
      level: "BLOCKER",
      code: "UNIT_CODE_MISMATCH",
      message: `Brief unit code (${briefUnitCode}) does not match selected spec unit (${selectedUnitCode}).`,
      briefValue: briefUnitCode,
      specValue: selectedUnitCode,
    });
  }

  if (!briefUnitTitle) {
    findings.push({
      level: "INFO",
      code: "UNIT_TITLE_MISSING",
      message: "Brief unit title was not confidently extracted from the brief header.",
    });
  } else if (selectedUnitTitle) {
    const score = similarity(briefUnitTitle, selectedUnitTitle);
    if (score < 0.55) {
      findings.push({
        level: "BLOCKER",
        code: "UNIT_TITLE_MISMATCH",
        message: `Brief unit title looks different from selected spec title.`,
        similarity: Number(score.toFixed(2)),
        briefValue: briefUnitTitle,
        specValue: selectedUnitTitle,
      });
    } else if (score < 0.9) {
      findings.push({
        level: "WARNING",
        code: "UNIT_TITLE_DRIFT",
        message: "Brief unit title differs from selected spec title (check wording/version drift).",
        similarity: Number(score.toFixed(2)),
        briefValue: briefUnitTitle,
        specValue: selectedUnitTitle,
      });
    }
  }

  const briefLoSet = new Set<string>([
    ...parseLoCodes(Array.isArray(briefDraft?.loHeaders) ? briefDraft.loHeaders.join(" ") : ""),
    ...parseLoCodes(Array.isArray(briefDraft?.criteriaBlock) ? briefDraft.criteriaBlock.join(" ") : ""),
  ]);

  for (const lo of briefLoSet) {
    if (!specLoSet.has(lo)) {
      findings.push({
        level: "BLOCKER",
        code: "LO_UNKNOWN",
        message: `Brief references ${lo}, but it does not exist in the selected spec.`,
        loCode: lo,
      });
    }
  }

  for (const lo of specLoSet) {
    if (briefLoSet.size && !briefLoSet.has(lo)) {
      findings.push({
        level: "WARNING",
        code: "LO_MISSING_IN_BRIEF",
        message: `${lo} is present in the selected spec but was not detected in the brief LO headers.`,
        loCode: lo,
      });
    }
  }

  const briefCriteriaText = parseBriefCriterionTexts(briefDraft);
  let comparedCriteriaTextCount = 0;
  for (const acCode of selectedCodes) {
    const spec = unitByAc.get(acCode);
    if (!spec) continue;
    const parsed = briefCriteriaText.get(acCode);
    if (parsed?.loCodes?.size) {
      const matchesLo = parsed.loCodes.has(normalizeSpace(spec.loCode).toUpperCase());
      if (!matchesLo) {
        findings.push({
          level: "BLOCKER",
          code: "LO_AC_MAPPING_MISMATCH",
          message: `${acCode} appears under the wrong LO in the brief (expected ${spec.loCode}).`,
          acCode,
          loCode: spec.loCode,
        });
      }
    }
    const specDesc = normalizeSpace(spec.description || "");
    const briefDesc = normalizeSpace(parsed?.description || "");
    if (!specDesc) continue;
    if (!briefDesc) {
      findings.push({
        level: "INFO",
        code: "AC_TEXT_MISSING",
        message: `Could not parse brief criterion text for ${acCode}; code-level checks only for this criterion.`,
        acCode,
      });
      continue;
    }
    comparedCriteriaTextCount += 1;
    const exact = normalizeCompareText(briefDesc) === normalizeCompareText(specDesc);
    if (exact) continue;
    const score = similarity(briefDesc, specDesc);
    if (score < 0.7) {
      findings.push({
        level: "WARNING",
        code: "AC_TEXT_MISMATCH",
        message: `${acCode} text differs from the selected spec (check brief wording or extraction).`,
        acCode,
        similarity: Number(score.toFixed(2)),
        briefValue: briefDesc,
        specValue: specDesc,
      });
    }
  }

  const blockerCount = findings.filter((f) => f.level === "BLOCKER").length;
  const warningCount = findings.filter((f) => f.level === "WARNING").length;
  const infoCount = findings.filter((f) => f.level === "INFO").length;

  return {
    ok: blockerCount === 0,
    blockerCount,
    warningCount,
    infoCount,
    findings,
    metrics: {
      specLoCount: specLoSet.size,
      briefLoCount: briefLoSet.size,
      specCriteriaCount: unitByAc.size,
      briefCriteriaTextParsedCount: briefCriteriaText.size,
      comparedCriteriaTextCount,
    },
  };
}

