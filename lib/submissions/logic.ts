// lib/submissions/logic.ts
// UI-only decision helpers (no AI spend). Keep types tolerant: DB enums evolve.

export type SubmissionCounts = { extractionRuns?: number; assessments?: number };

export type SubmissionForLogic = {
  status?: string | null;
  _count?: SubmissionCounts | null;
  uploadedAt?: string | Date | null;
};

export type DayGroup<T> = [dayLabel: string, rows: T[]];

export function deriveNextAction(s: SubmissionForLogic) {
  // IMPORTANT: treat status as a plain string to avoid TS narrowing issues
  // when Prisma/DB enums change across branches.
  const st: string = String(s?.status ?? "");

  const extractionRuns = s?._count?.extractionRuns ?? 0;
  const assessments = s?._count?.assessments ?? 0;

  const extractedStates = new Set(["EXTRACTED", "DONE", "ASSESSING", "MARKING"]);
  const hasExtraction = extractionRuns > 0 && extractedStates.has(st);

  if (st === "FAILED") return { label: "Attention needed", tone: "danger" as const };
  if (st === "NEEDS_OCR") return { label: "Needs OCR", tone: "warn" as const };

  if (!hasExtraction || st === "UPLOADED" || st === "EXTRACTING") {
    return { label: st === "EXTRACTING" ? "Extraction running" : "Needs extraction", tone: "warn" as const };
  }

  if (assessments === 0) {
    return { label: "Needs grading", tone: "warn" as const };
  }

  return { label: "Ready to upload to Totara", tone: "ok" as const };
}

/**
 * Groups submissions by uploaded date label, preserving insertion order.
 * Matches the usage pattern in useSubmissionsList.ts.
 */
export function groupByDay<T extends { uploadedAt?: string | Date | null }>(rows: T[]): DayGroup<T>[] {
  const list = Array.isArray(rows) ? rows : [];
  const groups = new Map<string, T[]>();

  for (const s of list) {
    const raw = s?.uploadedAt ?? null;
    const d = raw instanceof Date ? raw : raw ? new Date(raw) : null;
    const key = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString() : "Unknown date";

    const arr = groups.get(key);
    if (arr) arr.push(s);
    else groups.set(key, [s]);
  }

  return Array.from(groups.entries());
}
