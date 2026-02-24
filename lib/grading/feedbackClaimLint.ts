type CriterionCheckLite = {
  code?: string | null;
  decision?: string | null;
};

function normalizeText(value: unknown) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeCriterionCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase();
  return /^[PMD]\d{1,2}$/.test(code) ? code : "";
}

function isUnachievedDecision(value: unknown) {
  const d = String(value || "").trim().toUpperCase();
  return d === "NOT_ACHIEVED" || d === "UNCLEAR";
}

function softenLineForUnachievedCriterion(line: string) {
  let next = String(line || "");
  if (!next.trim()) return { line: next, changed: false };
  if (/\bnot achieved\b|\bstill open\b|\bto evidence\b|\bnot yet\b/i.test(next)) {
    return { line: next, changed: false };
  }

  const before = next;
  next = next
    .replace(/\bfully met\b/gi, "outlined")
    .replace(/\bachieved\b/gi, "discussed")
    .replace(/\bmeets\b/gi, "supports")
    .replace(/\bmet\b/gi, "discussed")
    .replace(/\bdemonstrated\b/gi, "outlined")
    .replace(/\bdemonstrates\b/gi, "shows")
    .replace(/\bapplied\b/gi, "outlined")
    .replace(/\bapplies\b/gi, "uses")
    .replace(/\bcompleted\b/gi, "outlined");

  return { line: next, changed: next !== before };
}

export function lintOverallFeedbackClaims(input: {
  text: string;
  criterionChecks: CriterionCheckLite[];
}) {
  const text = normalizeText(input.text);
  const unachieved = new Set(
    (Array.isArray(input.criterionChecks) ? input.criterionChecks : [])
      .filter((row) => isUnachievedDecision(row?.decision))
      .map((row) => normalizeCriterionCode(row?.code))
      .filter(Boolean)
  );
  if (!text.trim() || !unachieved.size) {
    return { text, changed: false, changedLines: 0 };
  }

  let changedLines = 0;
  const lines = text.split("\n").map((line) => {
    const codesInLine = Array.from(line.matchAll(/\b([PMD]\d{1,2})\b/gi)).map((m) => String(m[1] || "").toUpperCase());
    if (!codesInLine.some((code) => unachieved.has(code))) return line;
    if (!/\b(achieved|fully met|meets|met|demonstrated|demonstrates|applied|applies|completed)\b/i.test(line)) {
      return line;
    }
    const softened = softenLineForUnachievedCriterion(line);
    if (softened.changed) changedLines += 1;
    return softened.line;
  });

  return {
    text: lines.join("\n"),
    changed: changedLines > 0,
    changedLines,
  };
}

