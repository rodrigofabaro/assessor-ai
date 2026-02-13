import mammoth from "mammoth";

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    const value = String(m?.[1] || "").trim();
    if (value) return value;
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
      .replace(/\n{2,}/g, "\n")
      .trim();
    if (!text) return null;

    const assessorName = firstMatch(text, [/Assessor\s*Name\s*:\s*([^\n]+)/i]);
    const internalVerifierName = firstMatch(text, [/Internal\s*Verifier\s*Name\s*:\s*([^\n]+)/i]);
    const unitTitle = firstMatch(text, [/Unit\s*Title\s*:\s*([^\n]+)/i]);
    const assignmentTitle = firstMatch(text, [/Assignment\s*title\s*:\s*([^\n]+)/i]);
    const learningOutcomes = firstMatch(text, [/Learning\s*outcomes[\s\S]{0,80}?:\s*([^\n]+)/i]);
    const acsSubmitted = firstMatch(text, [
      /submitted to the Assignment Checking Service\?[\s\S]{0,80}\n(Yes|No)\b/i,
      /Assignment Checking Service[\s\S]{0,80}\b(Yes|No)\b/i,
    ]);

    const summary: Record<string, string> = {};
    if (assessorName) summary.assessorName = assessorName;
    if (internalVerifierName) summary.internalVerifierName = internalVerifierName;
    if (unitTitle) summary.unitTitle = unitTitle;
    if (assignmentTitle) summary.assignmentTitle = assignmentTitle;
    if (learningOutcomes) summary.learningOutcomes = learningOutcomes;
    if (acsSubmitted) summary.acsSubmitted = acsSubmitted.toUpperCase();
    return Object.keys(summary).length ? summary : null;
  } catch {
    return null;
  }
}

