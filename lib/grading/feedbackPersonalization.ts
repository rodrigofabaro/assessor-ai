function normalizeSpaces(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanNameToken(token: string): string {
  return token.replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, "").trim();
}

const HONORIFICS = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "prof",
  "sir",
  "madam",
]);

function extractFirstNameCandidate(rawName: string): string | null {
  const normalized = normalizeSpaces(rawName);
  if (!normalized) return null;
  const stripped = normalized.replace(/^student\s*name\s*[:\-]\s*/i, "");
  const parts = stripped
    .split(" ")
    .map((p) => cleanNameToken(p))
    .filter(Boolean);
  if (!parts.length) return null;
  for (const p of parts) {
    const low = p.toLowerCase();
    if (HONORIFICS.has(low)) continue;
    if (!/[A-Za-z]/.test(p)) continue;
    return p;
  }
  return null;
}

export function extractFirstNameForFeedback(input: {
  studentFullName?: string | null;
  coverStudentName?: string | null;
}): string | null {
  const fromStudent = extractFirstNameCandidate(String(input.studentFullName || ""));
  if (fromStudent) return fromStudent;
  const fromCover = extractFirstNameCandidate(String(input.coverStudentName || ""));
  if (fromCover) return fromCover;
  return null;
}

export function personalizeFeedbackSummary(summary: string, firstName?: string | null): string {
  const cleanSummary = normalizeSpaces(summary);
  const name = normalizeSpaces(firstName || "");
  if (!name) return cleanSummary;
  if (!cleanSummary) return name;
  const startsWithName = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[,\\s]`, "i").test(cleanSummary);
  if (startsWithName) return cleanSummary;
  return `${name}, ${cleanSummary}`;
}

