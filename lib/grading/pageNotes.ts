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
  return `${s.slice(0, Math.max(20, maxLen - 1))}...`;
}

function summarizeReason(v: string) {
  const src = sanitizeStudentNoteText(v)
    .replace(/\b(the\s+)?criterion\b/gi, "requirement")
    .replace(/\bthis\s+criterion\b/gi, "this requirement")
    .replace(/\bclear(er)?\s+evidence\b/gi, "specific evidence");
  if (!src) return "";
  const firstSentence = src.split(/[.!?]/)[0] || src;
  return compactLine(firstSentence, 90);
}

function summarizeEvidence(v: string) {
  const src = sanitizeStudentNoteText(v);
  if (!src) return "";
  return compactLine(src, 80);
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
  const context = summarizeEvidence(quote || visual);
  const base =
    decision === "NOT_ACHIEVED"
      ? tone === "strict"
        ? "This page needs stronger evidence and clearer evaluation."
        : "Strengthen this section with specific evidence and clearer evaluation."
      : decision === "UNCLEAR"
        ? tone === "strict"
          ? "The point on this page is unclear; tighten the technical explanation."
          : "Clarify exactly what this page demonstrates and why it matters."
        : tone === "supportive"
          ? "Good evidence appears on this page; keep linking it to the requirement."
          : "Evidence on this page is relevant; keep the requirement link explicit.";
  const anchor = context ? `Current text: "${context}".` : "";
  const improvement = rationale ? `Next step: ${rationale}.` : "";
  const merged = [base, anchor, improvement].filter(Boolean).join(" ");
  const line = compactLine(merged, 175);
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
