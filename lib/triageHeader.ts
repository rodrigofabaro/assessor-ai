// lib/triageHeader.ts
// Header/cover-page triage helpers.
// Keep output shape aligned with the TriageExtracted type used elsewhere.

export type TriageExtracted = {
  studentName: string | null;
  studentRef: string | null;
  email: string | null;
  unitCode: string | null;
  assignmentRef: string | null;
};

function norm(s: unknown): string | null {
  const t = String(s ?? "").trim();
  return t ? t : null;
}

/**
 * Extracts likely header fields from a snippet of text.
 * This is intentionally conservative (UI assist, not grading logic).
 */
export function triageHeader(text: string): TriageExtracted {
  const src = String(text ?? "");
  const lines = src
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 80);

  let studentName: string | null = null;
  let studentRef: string | null = null;
  let email: string | null = null;
  let unitCode: string | null = null;
  let assignmentRef: string | null = null;

  // Email
  for (const l of lines) {
    const m = l.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (m?.[0]) {
      email = m[0];
      break;
    }
  }

  // Student ref (AB / TA / etc) - keep broad
  for (const l of lines) {
    const m =
      l.match(/\b(?:AB|TA|ID)\s*[:#-]?\s*([A-Z0-9-]{4,})\b/i) ||
      l.match(/\b([A-Z]{1,3}\d{4,})\b/);
    if (m?.[1]) {
      studentRef = m[1];
      break;
    }
  }

  // Unit code (e.g., 4002 / 4017 / etc, or "Unit 4002")
  for (const l of lines) {
    const m = l.match(/\bUnit\s*(\d{4})\b/i) || l.match(/\b(\d{4})\b/);
    if (m?.[1]) {
      unitCode = m[1];
      break;
    }
  }

  // Assignment ref (A1/A2 etc)
  for (const l of lines) {
    const m = l.match(/\bA\s*(\d{1,2})\b/i) || l.match(/\b(A\d{1,2})\b/i);
    if (m?.[1]) {
      const raw = m[1].toUpperCase();
      assignmentRef = raw.startsWith("A") ? raw : `A${raw}`;
      break;
    }
  }

  // Student name: look for "Name:" first
  for (const l of lines) {
    const m = l.match(/\bName\s*[:\-]\s*(.+)$/i);
    if (m?.[1]) {
      studentName = norm(m[1]);
      break;
    }
  }

  // Fallback: first line that looks like a person name (2-4 words, no digits, no @)
  if (!studentName) {
    for (const l of lines) {
      if (l.length > 60) continue;
      if (/[0-9@]/.test(l)) continue;
      const words = l.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 4) {
        studentName = l;
        break;
      }
    }
  }

  return {
    studentName: studentName ?? null,
    studentRef: studentRef ?? null,
    email: email ?? null,
    unitCode: unitCode ?? null,
    assignmentRef: assignmentRef ?? null,
  };
}
