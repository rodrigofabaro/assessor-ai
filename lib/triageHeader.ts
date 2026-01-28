export type TriageExtracted = {
  fullName: string | null;
  studentRef: string | null;
  email: string | null;
  unitCode: string | null;
  assignmentRef: string | null;
  pearsonUnitSpecCode: string | null;
};

const WS = /\s+/g;

function clean(s: string): string {
  return s.replace(WS, " ").replace(/[\u2013\u2014]/g, "-").trim();
}

function pick(re: RegExp, text: string): string | null {
  const m = text.match(re);
  if (!m) return null;
  const v = clean(String(m[1] ?? ""));
  return v ? v.slice(0, 120) : null;
}

export function parseHeader(text: string): TriageExtracted {
  const t = (text ?? "").replace(/\r/g, "");

  const email = pick(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i, t);

  const name =
    pick(/(?:^|\n)\s*Name\s*:\s*([^\n]{2,120})/i, t) ??
    pick(/(?:^|\n)\s*Student\s*Name\s*:\s*([^\n]{2,120})/i, t);

  const unitCode =
    pick(/Unit\s*Name\s*:\s*(\d{4})\b/i, t) ??
    pick(/Unit\s*Code\s*:\s*(\d{4})\b/i, t) ??
    pick(/\bUnit\s+(\d{4})\b/i, t);

  const pearsonUnitSpecCode =
    pick(/Unit\s*Code\s*:\s*([A-Z]\/\d{3}\/\d{4})/i, t) ??
    pick(/\b([A-Z]\/\d{3}\/\d{4})\b/i, t);

  const studentRef = pick(
    /\b(?:Student\s*Ref|Student\s*ID|Ref)\s*[:#]?\s*([A-Z]{1,3}\d{3,10})\b/i,
    t
  );

  let assignmentRef =
    pick(/Assignment\s*Title\s*:\s*([A-Z]\d{1,2})\b/i, t) ??
    pick(/\bAssignment\s*([A-Z]\d{1,2})\b/i, t);

  if (!assignmentRef) {
    const m = t.match(/Assignment\s*(\d{1,2})\s*of\s*(\d{1,2})/i);
    if (m?.[1]) assignmentRef = `A${m[1]}`;
  }

  return {
    name: name ?? null,
    studentRef: studentRef ?? null,
    email: email ?? null,
    unitCode: unitCode ?? null,
    assignmentRef: assignmentRef ?? null,
    pearsonUnitSpecCode: pearsonUnitSpecCode ?? null,
  };
}

export function scoreExtracted(ex: TriageExtracted): { score: number; confidence: number } {
  let score = 0;
  if (ex.name) score += 4;
  if (ex.unitCode) score += 3;
  if (ex.assignmentRef) score += 2;
  if (ex.pearsonUnitSpecCode) score += 1;
  if (ex.email) score += 1;
  if (ex.studentRef) score += 1;

  // Map roughly 0..12 -> 0..1
  const confidence = Math.min(1, Math.max(0, (score - 1) / 10));
  return { score, confidence };
}
