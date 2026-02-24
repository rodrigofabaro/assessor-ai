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

function isDeterministicOutcomeLine(line: string) {
  const src = String(line || "").trim();
  if (!src) return false;
  return /^(To reach\s+[A-Z]+,|Criteria achieved:|Criteria still to evidence clearly:|Why these are still open:|Learning outcomes\s|Final grade:)/i.test(
    src
  );
}

function hasCaveatLanguage(line: string) {
  return /\b(however|but|could|can be|not fully|still open|still to|partially|to reach|gap)\b/i.test(String(line || ""));
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

function softenBandOverclaimLine(input: {
  line: string;
  outstandingBands: Set<string>;
  overallGrade?: string | null;
}) {
  let next = String(input.line || "");
  if (!next.trim()) return { line: next, changed: false };
  if (isDeterministicOutcomeLine(next)) return { line: next, changed: false };

  const before = next;
  const hasCaveat = hasCaveatLanguage(next);
  const overallGrade = String(input.overallGrade || "").trim().toUpperCase();

  if (input.outstandingBands.has("D")) {
    if (!hasCaveat) {
      next = next
        .replace(/\bcritical analysis\b/gi, "analysis")
        .replace(/\bcritical evaluation\b/gi, "evaluation")
        .replace(/\bdetailed recommendations\b/gi, "recommendations");
    }

    // Avoid language that implies distinction outcomes are already secured when D criteria remain open.
    if (/\bdistinction(-level)?\b/i.test(next) && !hasCaveat) {
      next = next
        .replace(/\bdistinction-level\b/gi, "higher-band")
        .replace(/\bdistinction\b/gi, "higher-band");
    }

    if (!hasCaveat && /\bhighest band\b/i.test(next)) {
      next = next.replace(/\bhighest band\b/gi, "higher band");
    }
  }

  if (overallGrade === "PASS" && !hasCaveat) {
    // If the final grade is PASS, avoid narrative lines that claim MERIT/DISTINCTION was achieved.
    if (/\b(merit|distinction)\b/i.test(next) && /\b(achieved|met|fully met|secured)\b/i.test(next)) {
      next = next
        .replace(/\bfully met\b/gi, "worked toward")
        .replace(/\bachieved\b/gi, "addressed")
        .replace(/\bmet\b/gi, "supported")
        .replace(/\bsecured\b/gi, "worked toward");
    }
  }

  return { line: next, changed: next !== before };
}

export function lintOverallFeedbackClaims(input: {
  text: string;
  criterionChecks: CriterionCheckLite[];
  overallGrade?: string | null;
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
  const outstandingBands = new Set(Array.from(unachieved).map((code) => String(code || "").charAt(0)).filter(Boolean));

  let changedLines = 0;
  const lines = text.split("\n").map((line) => {
    if (isDeterministicOutcomeLine(line)) return line;

    const bandSoftened = softenBandOverclaimLine({
      line,
      outstandingBands,
      overallGrade: input.overallGrade,
    });
    const nextLine = bandSoftened.line;
    if (bandSoftened.changed) changedLines += 1;

    const codesInLine = Array.from(nextLine.matchAll(/\b([PMD]\d{1,2})\b/gi)).map((m) => String(m[1] || "").toUpperCase());
    if (!codesInLine.some((code) => unachieved.has(code))) return nextLine;
    if (!/\b(achieved|fully met|meets|met|demonstrated|demonstrates|applied|applies|completed)\b/i.test(nextLine)) {
      return nextLine;
    }
    const softened = softenLineForUnachievedCriterion(nextLine);
    if (softened.changed) changedLines += 1;
    return softened.line;
  });

  return {
    text: lines.join("\n"),
    changed: changedLines > 0,
    changedLines,
  };
}
