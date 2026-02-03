import { firstMatch, normalizeWhitespace } from "./common";

function uniqSortedCodes(codes: string[]) {
  const set = new Set(codes.map((c) => c.toUpperCase().trim()).filter(Boolean));
  const arr = Array.from(set);
  const bandRank = (x: string) => (x[0] === "P" ? 0 : x[0] === "M" ? 1 : 2);
  arr.sort((a, b) => bandRank(a) - bandRank(b) || (parseInt(a.slice(1), 10) || 0) - (parseInt(b.slice(1), 10) || 0));
  return arr;
}

function stripLabelValue(v: string | null) {
  if (!v) return null;
  return normalizeWhitespace(v).replace(/^[:\-]\s*/, "").trim() || null;
}

function dateLike(s: string | null) {
  if (!s) return null;
  const v = normalizeWhitespace(s);
  // Keep as string for auditability; we can normalize later if needed.
  // Examples seen: "1st September 2025", "31 August 2026", "01/09/2025"
  const m =
    v.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}\b/) ||
    v.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/) ||
    v.match(/\b\d{4}-\d{2}-\d{2}\b/);
  return m ? m[0] : v;
}

export function extractBrief(text: string, fallbackTitle: string) {
  const t = text || "";

  // -------- Pearson / BTEC header fields (audit snapshot) --------
  const qualification = stripLabelValue(
    firstMatch(t, /\bQualification\b\s*([^\n\r]+)\b/i) ||
      firstMatch(t, /\bQualification\b\s*[:\-]?\s*([^\n\r]+)/i)
  );

  const academicYear = stripLabelValue(
    firstMatch(t, /\bAcademic\s+year\b\s*([^\n\r]+)\b/i) ||
      firstMatch(t, /\bAcademic\s+year\b\s*[:\-]?\s*([^\n\r]+)/i)
  );

  const assessor = stripLabelValue(
    firstMatch(t, /\bAssessor\b\s*([^\n\r]+)\b/i) ||
      firstMatch(t, /\bAssessor\b\s*[:\-]?\s*([^\n\r]+)/i)
  );

  const internalVerifier = stripLabelValue(
    firstMatch(t, /\bInternal\s+Verifier\b\s*([^\n\r]+)\b/i) ||
      firstMatch(t, /\bInternal\s+Verifier\b\s*[:\-]?\s*([^\n\r]+)/i)
  );

  const verificationDate = dateLike(
    stripLabelValue(
      firstMatch(t, /\bVerification\s+Date\b\s*([^\n\r]+)\b/i) ||
        firstMatch(t, /\bVerification\s+Date\b\s*[:\-]?\s*([^\n\r]+)/i)
    )
  );

  const issueDate = dateLike(
    stripLabelValue(
      firstMatch(t, /\bIssue\s+Date\b\s*([^\n\r]+)\b/i) ||
        firstMatch(t, /\bIssue\s+Date\b\s*[:\-]?\s*([^\n\r]+)/i)
    )
  );

  const finalSubmissionDate = dateLike(
    stripLabelValue(
      firstMatch(t, /\bFinal\s+Submission\s+Date\b\s*([^\n\r]+)\b/i) ||
        firstMatch(t, /\bFinal\s+Submission\s+Date\b\s*[:\-]?\s*([^\n\r]+)/i)
    )
  );

  const headerUnitCode = stripLabelValue(
    firstMatch(t, /\bUnit\s+Code\b\s*([A-Z0-9\/-]+)\b/i) ||
      firstMatch(t, /\bUnit\s+Code\b\s*[:\-]?\s*([A-Z0-9\/-]+)/i)
  );

  // Unit number and title (e.g., "Unit 5021. Further Control Systems Engineering")
  const unitNumberAndTitleRaw =
    firstMatch(t, /\bUnit\s+number\s+and\s+title\b\s*([^\n\r]+)\b/i) ||
    firstMatch(t, /\bUnit\s+number\s+and\s+title\b\s*[:\-]?\s*([^\n\r]+)/i) ||
    null;

  // -------- Existing structural fields used for binding/lock --------
  const unitCodeGuess =
    firstMatch(t, /\bUnit\s+number\s+and\s+title\s+(4\d{3})\b/i) ||
    firstMatch(t, /\bUnit\s+(4\d{3})\b/i) ||
    firstMatch(unitNumberAndTitleRaw || "", /\b(4\d{3})\b/i) ||
    firstMatch(fallbackTitle || "", /\b(4\d{3})\b/i);

  // Assignment 1 of 2
  const ass1 = t.match(/\bAssignment\s+(\d+)\s+of\s+(\d+)\b/i);
  const assignmentNumber = ass1?.[1] ? Number(ass1[1]) : null;
  const totalAssignments = ass1?.[2] ? Number(ass1[2]) : null;

  // Assignment title (Pearson label)
  const assignmentTitle =
    firstMatch(t, /\bAssignment\s+title\s+([^\n\r]+)\b/i) ||
    firstMatch(t, /\bAssignment\s+title\s*[:\-]\s*([^\n\r]+)\b/i) ||
    null;

  // AIAS – LEVEL 1
  const aiasLevelRaw = firstMatch(t, /\bAIAS\s*[–-]\s*LEVEL\s*(\d)\b/i);
  const aiasLevel = aiasLevelRaw ? Number(aiasLevelRaw) : null;

  // Assignment code: prefer derived from assignmentNumber
  const codeGuess =
    assignmentNumber ? `A${assignmentNumber}` :
    (t.match(/\bA\d+\b/i)?.[0]?.toUpperCase() ?? null);

  // Criteria codes: detect P/M/D numbers
  const codes = Array.from(t.toUpperCase().matchAll(/\b([PMD])\s*(\d{1,2})\b/g)).map(
    (m) => `${m[1]}${m[2]}`
  );
  const detectedCriterionCodes = uniqSortedCodes(codes);

  return {
    kind: "BRIEF" as const,

    // Human/audit header snapshot (strings; do not normalize into Dates yet)
    header: {
      qualification,
      academicYear,
      assessor,
      internalVerifier,
      verificationDate,
      issueDate,
      finalSubmissionDate,
      unitCode: headerUnitCode,
      unitNumberAndTitle: unitNumberAndTitleRaw ? normalizeWhitespace(unitNumberAndTitleRaw) : null,
    },

    // Operational fields used by your system
    title: assignmentTitle ? normalizeWhitespace(assignmentTitle) : null,
    assignmentCode: codeGuess,
    unitCodeGuess: unitCodeGuess || null,
    assignmentNumber,
    totalAssignments,
    aiasLevel,
    detectedCriterionCodes,
  };
}
