type CriterionCheckLite = {
  code?: string | null;
  decision?: string | null;
};

export type FeedbackAnnotationPolicyResult = {
  bullets: string[];
  changed: boolean;
  adjustments: string[];
};

function normalizeLine(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalKey(value: string) {
  return normalizeLine(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countOpenCriteria(rows: CriterionCheckLite[]) {
  let open = 0;
  for (const row of rows) {
    const decision = String(row?.decision || "").trim().toUpperCase();
    if (decision && decision !== "ACHIEVED") open += 1;
  }
  return open;
}

function isGenericBullet(line: string) {
  const src = normalizeLine(line).toLowerCase();
  if (!src) return true;
  return /\b(good work|well done|nice effort|great job|keep it up|satisfactory work|you did well)\b/.test(src);
}

function hasEvidenceOrActionSignal(line: string) {
  const src = normalizeLine(line);
  if (!src) return false;
  return /\b(page\s*\d+|pages?\s*\d+|criterion|criteria|p\d+\b|m\d+\b|d\d+\b|evidence|table|figure|justify|link|reference|strengthen|develop|expand|clarify|demonstrate|address)\b/i.test(
    src
  );
}

export function enforceFeedbackAnnotationPolicy(input: {
  bullets?: unknown[] | null;
  criterionChecks?: CriterionCheckLite[] | null;
  maxBullets?: number;
}) {
  const adjustments: string[] = [];
  const maxBullets = Math.max(1, Math.min(8, Number(input.maxBullets || 4)));
  const rows = Array.isArray(input.criterionChecks) ? input.criterionChecks : [];
  const openCriteria = countOpenCriteria(rows);

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const raw of Array.isArray(input.bullets) ? input.bullets : []) {
    const clean = normalizeLine(raw);
    if (!clean) continue;
    const key = canonicalKey(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(clean.endsWith(".") ? clean : `${clean}.`);
  }
  if (deduped.length < (Array.isArray(input.bullets) ? input.bullets.length : 0)) {
    adjustments.push("Removed duplicate/blank annotation bullets.");
  }

  const realistic = deduped.filter((line) => !isGenericBullet(line) || hasEvidenceOrActionSignal(line));
  if (realistic.length < deduped.length) {
    adjustments.push("Removed generic low-signal annotation bullets.");
  }

  let bullets = realistic;
  if (bullets.length > maxBullets) {
    bullets = bullets.slice(0, maxBullets);
    adjustments.push(`Trimmed annotation bullets to ${maxBullets}.`);
  }

  if (bullets.length === 0) {
    bullets = [
      openCriteria > 0
        ? "Address remaining criteria with specific page-linked evidence and concise technical justification."
        : "Maintain evidence-linked rationale in each task so moderation decisions remain clear and defensible.",
    ];
    adjustments.push("Injected fallback assessor-style annotation bullet.");
  }

  return {
    bullets,
    changed: adjustments.length > 0,
    adjustments,
  } as FeedbackAnnotationPolicyResult;
}
