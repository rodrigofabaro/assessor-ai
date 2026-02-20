type EvidenceLike = {
  page?: number | null;
  quote?: string | null;
  visualDescription?: string | null;
};

type CriterionCheckLike = {
  code?: string | null;
  decision?: string | null;
  rationale?: string | null;
  comment?: string | null;
  evidence?: EvidenceLike[] | null;
  met?: boolean | null;
};

export type MarkedPageNote = {
  page: number;
  lines: string[];
};

function normalizeText(v: unknown) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function sanitizeStudentNoteText(v: string) {
  return normalizeText(v)
    .replace(/\btype\s+(?:your\s+)?text\s+here\b/gi, "")
    .replace(/\benter\s+(?:your\s+)?text\s+here\b/gi, "")
    .replace(/\badd\s+(?:your\s+)?text\s+here\b/gi, "")
    .replace(/\binsert\s+text\b/gi, "")
    .replace(/\bclick\s+to\s+add\s+text\b/gi, "")
    .replace(/\(\s*\.{2,}\s*\)/g, "")
    .replace(/\.{3,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function decisionLabel(row: CriterionCheckLike) {
  const d = normalizeText(row.decision || "").toUpperCase();
  if (d) return d;
  if (row.met === true) return "ACHIEVED";
  if (row.met === false) return "NOT_ACHIEVED";
  return "UNCLEAR";
}

function compactLine(v: string, maxLen = 130) {
  const s = sanitizeStudentNoteText(v);
  if (s.length <= maxLen) return s;
  const clippedRaw = s.slice(0, Math.max(20, maxLen));
  const sentenceStop = Math.max(clippedRaw.lastIndexOf(". "), clippedRaw.lastIndexOf("! "), clippedRaw.lastIndexOf("? "));
  if (sentenceStop > Math.floor(maxLen * 0.55)) {
    return clippedRaw.slice(0, sentenceStop + 1).trim();
  }
  const clipped = clippedRaw.replace(/\s+\S*$/, "").replace(/[,(;:\s-]+$/, "").trim();
  return clipped || s.slice(0, Math.max(20, maxLen)).trim();
}

function toSentence(v: string) {
  const s = sanitizeStudentNoteText(v);
  if (!s) return "";
  if (/[.!?]$/.test(s)) return s;
  return `${s}.`;
}

function summarizeReason(v: string) {
  const src = sanitizeStudentNoteText(v)
    .replace(/\b(the\s+)?criterion\b/gi, "requirement")
    .replace(/\bthis\s+criterion\b/gi, "this requirement")
    .replace(/\bclear(er)?\s+evidence\b/gi, "specific evidence")
    .replace(/\bthe\s+(submission|report|work)\b/gi, "your work");
  if (!src) return "";
  const firstSentence = src.split(/[.!?]/)[0] || src;
  return compactLine(firstSentence, 110);
}

function summarizeEvidence(v: string) {
  const src = sanitizeStudentNoteText(v)
    .replace(/^["']+/, "")
    .replace(/["']+$/, "")
    .replace(/\s*\.\s*$/, "");
  if (!src) return "";
  return compactLine(src, 70);
}

function cleanEvidenceLead(v: string) {
  const src = sanitizeStudentNoteText(v);
  return src.replace(/^current\s+text\s*[:\-]\s*/i, "").trim();
}

function hashSeed(v: string) {
  let seed = 0;
  for (let i = 0; i < v.length; i += 1) seed = (seed + v.charCodeAt(i) * (i + 1)) % 10007;
  return seed;
}

function pickVariant(options: string[], seedSource: string) {
  if (!options.length) return "";
  const idx = hashSeed(seedSource) % options.length;
  return options[idx];
}

function lowerFirst(v: string) {
  const s = sanitizeStudentNoteText(v);
  if (!s) return "";
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function inferActionFromRationale(rationale: string, decision: string) {
  const src = sanitizeStudentNoteText(rationale);
  const lower = src.toLowerCase();
  if (!src) {
    return decision === "ACHIEVED"
      ? "add one sentence that explains the impact of this evidence"
      : "add explicit evidence and explain how it meets the requirement";
  }
  if (/\b(alternative|milestone|gantt|critical path|monitor)\b/i.test(lower)) {
    return "compare at least one alternative milestone-tracking method and justify your chosen approach";
  }
  if (/\b(lacks depth|critical(ly)? evaluat|critical(ly)? analys|not critically)\b/i.test(lower)) {
    return "deepen evaluation: what worked, what did not, and what you would change next";
  }
  if (/\b(recommendation|further development|improvement)\b/i.test(lower) && /\b(not|insufficient|unclear|limited)\b/i.test(lower)) {
    return "add specific, measurable recommendations and expected impact";
  }
  if (/\b(not|insufficient|unclear|limited|missing|does not|cannot)\b/i.test(lower)) {
    return `address this gap: ${lowerFirst(src)}`;
  }
  return decision === "ACHIEVED"
    ? `extend this by ${lowerFirst(src)}`
    : `add clearer evidence: ${lowerFirst(src)}`;
}

function toPageAnchoredLine(
  row: CriterionCheckLike,
  evidence: EvidenceLike,
  tone: string,
  includeCode: boolean
) {
  const code = normalizeText(row?.code || "Criterion");
  const decision = decisionLabel(row);
  const rationale = summarizeReason(normalizeText(row?.rationale || row?.comment || ""));
  const quote = sanitizeStudentNoteText(String(evidence?.quote || ""));
  const visual = sanitizeStudentNoteText(String(evidence?.visualDescription || ""));
  const context = summarizeEvidence(cleanEvidenceLead(quote || visual));
  const seedSource = `${code}|${decision}|${context}|${rationale}`;
  const achievedLead = pickVariant(
    ["Strong evidence here", "Good progress on this page", "This section is working well"],
    seedSource
  );
  const weakLead = pickVariant(
    ["Improve this section next", "Target this page for improvement", "This page needs a stronger link to the requirement"],
    seedSource
  );
  const unclearLead = pickVariant(
    ["Clarify this section", "Make this point clearer", "This page needs clearer explanation"],
    seedSource
  );
  const lead =
    decision === "ACHIEVED"
      ? achievedLead
      : decision === "UNCLEAR"
        ? unclearLead
        : weakLead;
  const evidenceLine = context ? toSentence(`Evidence: ${context}`) : "";
  const action = inferActionFromRationale(rationale, decision);
  const actionPrefix =
    decision === "ACHIEVED"
      ? tone === "supportive"
        ? "To push higher"
        : "To strengthen further"
      : "Next step";
  const actionLine = toSentence(`${actionPrefix}: ${action}`);
  const fallback = toSentence("Add a direct evidence statement that clearly matches the requirement");
  const merged = [toSentence(lead), evidenceLine, actionLine].filter(Boolean).join(" ") || fallback;
  const line = compactLine(merged, 165);
  return includeCode ? compactLine(`${code}: ${line}`, 170) : line;
}

export function extractCriterionChecksFromResultJson(resultJson: any): CriterionCheckLike[] {
  const r = resultJson && typeof resultJson === "object" ? resultJson : {};
  const fromResponse = Array.isArray(r?.response?.criterionChecks) ? r.response.criterionChecks : null;
  const fromStructured = Array.isArray(r?.structuredGradingV2?.criterionChecks) ? r.structuredGradingV2.criterionChecks : null;
  const rows = fromResponse || fromStructured || [];
  return Array.isArray(rows) ? rows : [];
}

export function buildPageNotesFromCriterionChecks(
  rows: CriterionCheckLike[],
  options?: {
    maxPages?: number;
    maxLinesPerPage?: number;
    tone?: "supportive" | "professional" | "strict";
    includeCriterionCode?: boolean;
    minPage?: number;
    totalPages?: number;
  }
): MarkedPageNote[] {
  const configuredMaxPages = Math.max(1, Math.min(20, Number(options?.maxPages || 6)));
  const totalPages = Math.max(0, Math.min(500, Number(options?.totalPages || 0)));
  const adaptiveMaxPages =
    totalPages >= 45
      ? Math.max(configuredMaxPages, 12)
      : totalPages >= 30
        ? Math.max(configuredMaxPages, 9)
        : totalPages >= 20
          ? Math.max(configuredMaxPages, 7)
          : configuredMaxPages;
  const maxPages = Math.max(1, Math.min(20, adaptiveMaxPages));
  const maxLinesPerPage = Math.max(1, Math.min(8, Number(options?.maxLinesPerPage || 3)));
  const minPage = Math.max(1, Math.min(20, Number(options?.minPage || 1)));
  const tone = String(options?.tone || "professional").toLowerCase();
  const includeCode = options?.includeCriterionCode !== false;
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const hasEvidence = (row: CriterionCheckLike) =>
    (Array.isArray(row?.evidence) ? row.evidence : []).some((e) => Number(e?.page || 0) > 0);
  const sourceRows = normalizedRows.filter(hasEvidence);
  const byPage = new Map<number, Array<{ line: string; priority: number }>>();
  const decisionPriority = (decision: string) =>
    decision === "NOT_ACHIEVED" ? 0 : decision === "UNCLEAR" ? 1 : 2;

  for (const row of sourceRows) {
    const evidenceRows = Array.isArray(row?.evidence) ? row.evidence : [];
    const rowDecision = decisionLabel(row);
    for (const ev of evidenceRows) {
      const p = Number(ev?.page || 0);
      if (!Number.isInteger(p) || p < minPage) continue;
      const line = toPageAnchoredLine(row, ev, tone, includeCode);
      if (!line) continue;
      if (!byPage.has(p)) byPage.set(p, []);
      const lines = byPage.get(p)!;
      if (!lines.some((item) => item.line === line)) {
        lines.push({ line, priority: decisionPriority(rowDecision) });
      }
    }
  }

  const allPages = Array.from(byPage.keys()).sort((a, b) => a - b);
  if (!allPages.length) return [];

  const criticalPages = allPages.filter((page) =>
    (byPage.get(page) || []).some((item) => item.priority < 2)
  );
  const selected = new Set<number>();
  for (const page of criticalPages) {
    selected.add(page);
    if (selected.size >= maxPages) break;
  }
  if (selected.size < maxPages) {
    const remaining = allPages.filter((p) => !selected.has(p));
    const needed = maxPages - selected.size;
    if (remaining.length <= needed) {
      for (const page of remaining) selected.add(page);
    } else if (needed === 1) {
      selected.add(remaining[Math.floor(remaining.length / 2)]);
    } else {
      for (let i = 0; i < needed; i += 1) {
        const idx = Math.round((i * (remaining.length - 1)) / (needed - 1));
        selected.add(remaining[idx]);
      }
    }
  }

  return Array.from(selected.values())
    .sort((a, b) => a - b)
    .map((page) => {
      const items = byPage.get(page) || [];
      const critical = items.filter((i) => i.priority < 2).sort((a, b) => a.priority - b.priority);
      const noteItems = critical.length
        ? critical.slice(0, maxLinesPerPage)
        : items.sort((a, b) => a.priority - b.priority).slice(0, Math.min(2, maxLinesPerPage));
      const lines = noteItems
        .map((i) => sanitizeStudentNoteText(i.line))
        .filter(Boolean);
      return { page, lines };
    });
}
