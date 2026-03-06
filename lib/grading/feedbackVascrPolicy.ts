type CriterionCheckLite = {
  code?: string | null;
  decision?: string | null;
};

export type FeedbackVascrPolicyResult = {
  summary: string;
  changed: boolean;
  adjustments: string[];
};

function normalizeText(value: unknown) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function splitSentences(value: string) {
  const src = normalizeText(value)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1");
  if (!src) return [] as string[];
  const parts = src
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [src];
}

function canonicalSentenceKey(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeSentence(value: string) {
  const text = normalizeText(value).replace(/\s+/g, " ");
  if (!text) return "";
  return text.endsWith(".") || text.endsWith("!") || text.endsWith("?") ? text : `${text}.`;
}

function countOpenCriteria(rows: CriterionCheckLite[]) {
  let open = 0;
  for (const row of rows) {
    const decision = String(row?.decision || "").trim().toUpperCase();
    if (decision && decision !== "ACHIEVED") open += 1;
  }
  return open;
}

export function enforceFeedbackVascrPolicy(input: {
  summary: string;
  overallGrade?: string | null;
  criterionChecks?: CriterionCheckLite[] | null;
  maxSentences?: number;
}) {
  const adjustments: string[] = [];
  const maxSentences = Math.max(2, Math.min(5, Number(input.maxSentences || 4)));
  const rows = Array.isArray(input.criterionChecks) ? input.criterionChecks : [];
  const openCriteriaCount = countOpenCriteria(rows);

  const originalSentences = splitSentences(input.summary);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const sentence of originalSentences) {
    const clean = sanitizeSentence(sentence);
    if (!clean) continue;
    const key = canonicalSentenceKey(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(clean);
  }

  if (deduped.length < originalSentences.length) {
    adjustments.push("Removed repeated summary sentences.");
  }

  let sentences = deduped;
  if (sentences.length > maxSentences) {
    sentences = sentences.slice(0, maxSentences);
    adjustments.push(`Trimmed summary to ${maxSentences} sentences for concise assessor output.`);
  }

  const merged = sentences.join(" ").trim();
  const hasEvidenceSignal = /\b(evidence|criterion|criteria|mapped|audit|moderation|defensible)\b/i.test(merged);
  if (!hasEvidenceSignal) {
    const evidenceLine =
      openCriteriaCount > 0
        ? "This assessment decision is linked to mapped evidence and remaining criteria gaps."
        : "This assessment decision is linked to mapped evidence and criterion outcomes.";
    sentences.push(evidenceLine);
    adjustments.push("Added evidence/criteria signal for defensible decision wording.");
  }

  const mergedWithEvidence = sentences.join(" ").trim();
  const needsActionSignal = openCriteriaCount > 0;
  const hasActionSignal = /\b(to improve|to progress|to reach|next step|strengthen|develop|address)\b/i.test(
    mergedWithEvidence
  );
  if (needsActionSignal && !hasActionSignal) {
    sentences.push("To improve the outcome, address remaining criteria with explicit evidence links.");
    adjustments.push("Added concise feed-forward action guidance.");
  }

  const summary = sentences.join(" ").replace(/\s+/g, " ").trim();
  return {
    summary: summary || "Feedback provided below.",
    changed: adjustments.length > 0,
    adjustments,
  } as FeedbackVascrPolicyResult;
}

