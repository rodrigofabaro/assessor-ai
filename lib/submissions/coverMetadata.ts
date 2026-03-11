export type CoverMetadataField = {
  value: string;
  confidence: number;
  page: number;
  snippet: string;
};

export type SubmissionCoverMetadata = {
  studentName?: CoverMetadataField;
  studentId?: CoverMetadataField;
  unitCode?: CoverMetadataField;
  assignmentCode?: CoverMetadataField;
  submissionDate?: CoverMetadataField;
  assessorName?: CoverMetadataField;
  declarationPresent?: {
    value: boolean;
    confidence: number;
    page: number;
    snippet: string;
  };
  confidence: number;
};

export function isCoverMetadataReady(cover: any): boolean {
  if (!cover || typeof cover !== "object") return false;
  const fields = [
    cover.studentName?.value,
    cover.studentId?.value,
    cover.unitCode?.value,
    cover.assignmentCode?.value,
    cover.submissionDate?.value,
  ]
    .map((v: unknown) => String(v || "").trim())
    .filter(Boolean);
  const conf = Number(cover.confidence || 0);
  return fields.length >= 2 && conf >= 0.5;
}

function normalizeText(input: string) {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function buildField(value: string, confidence: number, page: number, snippet: string): CoverMetadataField | undefined {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return {
    value: clean,
    confidence,
    page,
    snippet: String(snippet || clean).replace(/\s+/g, " ").trim(),
  };
}

function capture(label: string, re: RegExp, page: number, text: string): CoverMetadataField | undefined {
  const m = text.match(re);
  if (!m || !m[1]) return undefined;
  const value = String(m[1]).trim();
  if (!value) return undefined;
  const idx = m.index ?? text.indexOf(m[0]);
  const snippet = text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + m[0].length + 40)).trim();
  const confidence = label === "studentName" ? 0.72 : 0.84;
  return { value, confidence, page, snippet };
}

function looksLikeDeclaration(text: string) {
  return /\b(i\s+declare|declaration|this work is my own|plagiarism)\b/i.test(text);
}

function splitMeaningfulLines(text: string) {
  return String(text || "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeAssignmentCode(value: string) {
  const raw = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  const m = raw.match(/^A?([1-9]\d?)$/);
  return m ? `A${m[1]}` : raw;
}

function isLikelyPersonNameLine(value: string) {
  const clean = String(value || "").replace(/[.,;:]+$/g, "").trim();
  if (!clean || /\d/.test(clean)) return false;
  if (
    /\b(unit|assignment|student|assessor|date|submitted|submission|candidate|learner|course|programme|program|thermofluids)\b/i.test(
      clean
    )
  ) {
    return false;
  }
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return false;
  return tokens.every((token) => /^[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)*$/.test(token));
}

function extractTitleBlockUnitCode(page: number, text: string) {
  for (const line of splitMeaningfulLines(text).slice(0, 6)) {
    const m = line.match(/\bunit\s*([0-9]{1,4})\b/i);
    if (!m?.[1]) continue;
    return buildField(m[1], 0.9, page, line);
  }
  return undefined;
}

function extractTitleBlockAssignmentCode(page: number, text: string) {
  for (const line of splitMeaningfulLines(text).slice(0, 8)) {
    const m = line.match(/\bassignment\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A]?\d{1,2})\b/i);
    if (!m?.[1]) continue;
    return buildField(normalizeAssignmentCode(m[1]), 0.88, page, line);
  }
  return undefined;
}

function extractTitleBlockStudentName(page: number, text: string) {
  const lines = splitMeaningfulLines(text).slice(0, 8);
  if (!lines.length) return undefined;

  const anchorIndex = lines.findIndex((line) => /\b(unit|assignment)\b/i.test(line));
  if (anchorIndex >= 0) {
    for (let i = anchorIndex + 1; i < Math.min(lines.length, anchorIndex + 4); i += 1) {
      if (!isLikelyPersonNameLine(lines[i])) continue;
      return buildField(lines[i], 0.8, page, lines[i]);
    }
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!isLikelyPersonNameLine(lines[i])) continue;
    return buildField(lines[i], 0.76, page, lines[i]);
  }

  return undefined;
}

export function extractCoverMetadataFromPages(
  pages: Array<{ pageNumber?: number | null; text?: string | null }>
): SubmissionCoverMetadata {
  const head = (Array.isArray(pages) ? pages : []).slice(0, 2).map((p, idx) => ({
    pageNumber: Number(p?.pageNumber || idx + 1),
    text: normalizeText(String(p?.text || "")),
  }));

  const out: SubmissionCoverMetadata = { confidence: 0 };
  const scores: number[] = [];

  for (const p of head) {
    if (!out.studentName) {
      out.studentName =
        capture("studentName", /\bstudent\s*name\s*[:\-]\s*([^\n]{2,120})/i, p.pageNumber, p.text) ||
        capture("studentName", /\bname\s*[:\-]\s*([^\n]{2,120})/i, p.pageNumber, p.text);
      if (out.studentName) scores.push(out.studentName.confidence);
    }
    if (!out.studentId) {
      out.studentId =
        capture("studentId", /\b(student\s*id|id)\s*[:\-]\s*([A-Za-z0-9\-\/]{3,40})/i, p.pageNumber, p.text)
          ? (() => {
              const m = p.text.match(/\b(student\s*id|id)\s*[:\-]\s*([A-Za-z0-9\-\/]{3,40})/i);
              const val = String(m?.[2] || "").trim();
              if (!val) return undefined;
              return {
                value: val,
                confidence: 0.86,
                page: p.pageNumber,
                snippet: String(m?.[0] || "").trim(),
              } satisfies CoverMetadataField;
            })()
          : undefined;
      if (out.studentId) scores.push(out.studentId.confidence);
    }
    if (!out.unitCode) {
      out.unitCode =
        capture("unitCode", /\bunit\s*(?:code)?\s*[:\-]\s*([0-9]{1,4})\b/i, p.pageNumber, p.text) ||
        extractTitleBlockUnitCode(p.pageNumber, p.text) ||
        capture("unitCode", /\b(u[0-9]{4}|[0-9]{4})\b/i, p.pageNumber, p.text);
      if (out.unitCode) scores.push(out.unitCode.confidence);
    }
    if (!out.assignmentCode) {
      const labeledAssignment = p.text.match(/\bassignment\s*(?:number|no\.?|code)?\s*[:\-]?\s*([A]?\d{1,2})\b/i);
      out.assignmentCode =
        (labeledAssignment?.[1]
          ? buildField(normalizeAssignmentCode(labeledAssignment[1]), 0.84, p.pageNumber, labeledAssignment[0] || "")
          : undefined) ||
        extractTitleBlockAssignmentCode(p.pageNumber, p.text) ||
        capture("assignmentCode", /\b(A\d+)\b/i, p.pageNumber, p.text);
      if (out.assignmentCode) scores.push(out.assignmentCode.confidence);
    }
    if (!out.submissionDate) {
      out.submissionDate =
        capture(
          "submissionDate",
          /\b(submission\s*date|date\s*submitted|date)\s*[:\-]\s*([0-3]?\d[\/\-][01]?\d[\/\-](?:19|20)?\d{2})/i,
          p.pageNumber,
          p.text
        )
          ? (() => {
              const m = p.text.match(
                /\b(submission\s*date|date\s*submitted|date)\s*[:\-]\s*([0-3]?\d[\/\-][01]?\d[\/\-](?:19|20)?\d{2})/i
              );
              const val = String(m?.[2] || "").trim();
              if (!val) return undefined;
              return {
                value: val,
                confidence: 0.84,
                page: p.pageNumber,
                snippet: String(m?.[0] || "").trim(),
              } satisfies CoverMetadataField;
            })()
          : undefined;
      if (out.submissionDate) scores.push(out.submissionDate.confidence);
    }
    if (!out.assessorName) {
      out.assessorName = capture("assessorName", /\bassessor\s*(?:name)?\s*[:\-]\s*([^\n]{2,120})/i, p.pageNumber, p.text);
      if (out.assessorName) scores.push(out.assessorName.confidence);
    }
    if (!out.studentName) {
      out.studentName = extractTitleBlockStudentName(p.pageNumber, p.text);
      if (out.studentName) scores.push(out.studentName.confidence);
    }
    if (!out.declarationPresent && looksLikeDeclaration(p.text)) {
      out.declarationPresent = {
        value: true,
        confidence: 0.8,
        page: p.pageNumber,
        snippet: "Declaration text detected on cover page.",
      };
      scores.push(0.8);
    }
  }

  out.confidence = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return out;
}
