export function normalizeCriteriaCode(value: unknown): string | null {
  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/^([PMD])\s*(\d+)$/);
  if (!match) return null;
  return `${match[1]}${Number(match[2])}`;
}

function bandRank(code: string) {
  if (code.startsWith("P")) return 0;
  if (code.startsWith("M")) return 1;
  if (code.startsWith("D")) return 2;
  return 9;
}

export function sortCriteriaCodes(codes: string[]): string[] {
  return [...codes].sort((a, b) => {
    const rankDiff = bandRank(a) - bandRank(b);
    if (rankDiff !== 0) return rankDiff;
    const an = Number((a.match(/\d+/) || ["0"])[0]);
    const bn = Number((b.match(/\d+/) || ["0"])[0]);
    if (an !== bn) return an - bn;
    return a.localeCompare(b);
  });
}

export function uniqSortedCriteriaCodes(codes: unknown[]): string[] {
  const set = new Set<string>();
  for (const code of codes || []) {
    const normalized = normalizeCriteriaCode(code);
    if (normalized) set.add(normalized);
  }
  return sortCriteriaCodes(Array.from(set));
}

export function extractCriteriaCodesFromText(text: string): string[] {
  if (!text) return [];
  // Ignore synthetic extraction markers like [[EQ:p4-eq1]] that can look like criteria codes.
  const scrubbed = String(text).replace(/\[\[[^\]]+\]\]/g, " ");
  const matches = Array.from(scrubbed.matchAll(/\b([PMD])\s*(\d+)\b/gi)).map((m) => `${m[1]}${m[2]}`);
  return uniqSortedCriteriaCodes(matches);
}
