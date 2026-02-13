import mammoth from "mammoth";

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    const value = String(m?.[1] || "").trim();
    if (value) return value;
  }
  return null;
}

function lastMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const globalRe = new RegExp(re.source, flags);
    const hits = Array.from(text.matchAll(globalRe));
    if (!hits.length) continue;
    const value = String(hits[hits.length - 1]?.[1] || "").trim();
    if (value) return value;
  }
  return null;
}

function normalizeDateCandidate(value: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, " ").trim();
  if (
    /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|[0-3]?\d\s+[A-Za-z]{3,9}\s+\d{2,4})$/i.test(
      compact
    )
  ) {
    return compact;
  }
  return null;
}

export async function extractIvSummaryFromDocxBuffer(buffer: Buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const raw = String(result?.value || "");
    const text = raw
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) return null;
    const tailStart = Math.max(0, Math.floor(text.length * 0.55));
    const tail = text.slice(tailStart);

    const assessorName = firstMatch(text, [/Assessor\s*Name\s*:\s*([^\n]+)/i]);
    const internalVerifierName = firstMatch(text, [/Internal\s*Verifier\s*Name\s*:\s*([^\n]+)/i]);
    const unitTitle = firstMatch(text, [/Unit\s*Title\s*:\s*([^\n]+)/i]);
    const assignmentTitle = firstMatch(text, [/Assignment\s*title\s*:\s*([^\n]+)/i]);
    const learningOutcomes = firstMatch(text, [/Learning\s*outcomes[\s\S]{0,80}?:\s*([^\n]+)/i]);
    const acsSubmitted = firstMatch(text, [
      /submitted to the Assignment Checking Service\?[\s\S]{0,80}\n(Yes|No)\b/i,
      /Assignment Checking Service[\s\S]{0,80}\b(Yes|No)\b/i,
    ]);
    const verificationDate = normalizeDateCandidate(
      lastMatch(tail, [
        /(?:Verification\s*Date|Date\s*Verified|Verified\s*Date)\s*[:\-]\s*([^\n]+)/i,
        /Internal\s*Verifier[\s\S]{0,120}?\nDate\s*[:\-]?\s*([^\n]+)/i,
      ]) || firstMatch(text, [/(?:Verification\s*Date|Date\s*Verified|Verified\s*Date)\s*[:\-]\s*([^\n]+)/i])
    );
    const generalComments =
      lastMatch(tail, [
        /General\s*comments?\s*[:\-]\s*([\s\S]{0,800}?)(?:\n(?:Assessor|Internal\s*Verifier|Outcome|Date|Signature|Signed)\b|$)/i,
        /Comments?\s*[:\-]\s*([\s\S]{0,800}?)(?:\n(?:Assessor|Internal\s*Verifier|Outcome|Date|Signature|Signed)\b|$)/i,
      ]) || null;

    const summary: Record<string, string> = {};
    if (assessorName) summary.assessorName = assessorName;
    if (internalVerifierName) summary.internalVerifierName = internalVerifierName;
    if (unitTitle) summary.unitTitle = unitTitle;
    if (assignmentTitle) summary.assignmentTitle = assignmentTitle;
    if (learningOutcomes) summary.learningOutcomes = learningOutcomes;
    if (acsSubmitted) summary.acsSubmitted = acsSubmitted.toUpperCase();
    if (verificationDate) summary.verificationDate = verificationDate;
    if (generalComments) summary.generalComments = generalComments.replace(/\s*\n\s*/g, "\n").trim();
    return Object.keys(summary).length ? summary : null;
  } catch {
    return null;
  }
}
