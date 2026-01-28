import type { SubmissionRow } from "./types";

export function deriveNextAction(s: SubmissionRow) {
  const st = String(s.status || "");
  if (st === "FAILED") return { label: "Attention needed", tone: "danger" as const };
  if (st === "NEEDS_OCR") return { label: "Needs OCR", tone: "warn" as const };

  const extractionRuns = s._count?.extractionRuns ?? 0;
  const assessments = s._count?.assessments ?? 0;
  const hasExtraction =
    extractionRuns > 0 && (st === "EXTRACTED" || st === "DONE" || st === "ASSESSING" || st === "MARKING");

  if (!hasExtraction || st === "UPLOADED" || st === "EXTRACTING") {
    return { label: st === "EXTRACTING" ? "Extraction running" : "Needs extraction", tone: "warn" as const };
  }

  if (assessments === 0) {
    return { label: "Needs grading", tone: "warn" as const };
  }

  return { label: "Ready to upload to Totara", tone: "ok" as const };
}

export function groupByDay(list: SubmissionRow[]) {
  const groups = new Map<string, SubmissionRow[]>();
  for (const s of list) {
    const d = new Date(s.uploadedAt);
    const key = Number.isNaN(d.getTime()) ? "Unknown date" : d.toLocaleDateString();
    const arr = groups.get(key) || [];
    arr.push(s);
    groups.set(key, arr);
  }
  return Array.from(groups.entries());
}
