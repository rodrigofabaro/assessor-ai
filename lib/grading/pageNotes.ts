type EvidenceLike = { page?: number | null };

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

function decisionLabel(row: CriterionCheckLike) {
  const d = normalizeText(row.decision || "").toUpperCase();
  if (d) return d;
  if (row.met === true) return "ACHIEVED";
  if (row.met === false) return "NOT_ACHIEVED";
  return "UNCLEAR";
}

function compactLine(v: string, maxLen = 130) {
  const s = normalizeText(v);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(20, maxLen - 1))}...`;
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
  }
): MarkedPageNote[] {
  const maxPages = Math.max(1, Math.min(20, Number(options?.maxPages || 6)));
  const maxLinesPerPage = Math.max(1, Math.min(8, Number(options?.maxLinesPerPage || 3)));
  const tone = String(options?.tone || "professional").toLowerCase();
  const includeCode = options?.includeCriterionCode !== false;
  const byPage = new Map<number, string[]>();

  for (const row of Array.isArray(rows) ? rows : []) {
    const code = normalizeText(row?.code || "Criterion");
    const decision = decisionLabel(row);
    const rationale = normalizeText(row?.rationale || row?.comment || "");
    const guidance = rationale || (
      decision === "ACHIEVED"
        ? tone === "supportive"
          ? "Clear evidence shown; keep this standard."
          : tone === "strict"
            ? "Evidence present; maintain specification accuracy."
            : "Evidence is present."
        : decision === "NOT_ACHIEVED"
          ? tone === "supportive"
            ? "Add clearer evidence to secure this criterion."
            : tone === "strict"
              ? "Insufficient evidence; provide explicit criterion evidence."
              : "More evidence is required."
          : tone === "supportive"
            ? "Clarify this section to strengthen evidence."
            : tone === "strict"
              ? "Evidence unclear; tighten technical clarity."
              : "Evidence needs clarification."
    );
    const prefix = includeCode ? `${code} (${decision}): ` : "";
    const line = compactLine(`${prefix}${guidance}`);
    const pages = Array.from(
      new Set(
        (Array.isArray(row?.evidence) ? row.evidence : [])
          .map((e) => Number(e?.page || 0))
          .filter((n) => Number.isInteger(n) && n > 0)
      )
    );
    for (const p of pages) {
      if (!byPage.has(p)) byPage.set(p, []);
      const lines = byPage.get(p)!;
      if (!lines.includes(line)) lines.push(line);
    }
  }

  return Array.from(byPage.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(0, maxPages)
    .map(([page, lines]) => ({ page, lines: lines.slice(0, maxLinesPerPage) }));
}
