export type BriefReadiness = "READY" | "ATTN" | "BLOCKED";
export type IvOutcome = "APPROVED" | "CHANGES_REQUIRED" | "REJECTED";

export function computeBriefReadiness(input: {
  briefLocked?: string | null;
  unitLocked?: string | null;
  hasLinkedDoc?: boolean;
  linkedDocLocked?: string | null;
  headerYear?: string | null;
  ivForYearOutcome?: IvOutcome | null;
}): { readiness: BriefReadiness; reason: string } {
  if (!input.briefLocked) return { readiness: "BLOCKED", reason: "Brief is not locked." };
  if (!input.hasLinkedDoc) return { readiness: "BLOCKED", reason: "No PDF linked to this brief." };
  if (!input.linkedDocLocked) return { readiness: "ATTN", reason: "PDF is linked but not locked." };
  if (!input.unitLocked) return { readiness: "ATTN", reason: "Unit spec is not locked yet." };
  if (!input.headerYear) return { readiness: "ATTN", reason: "Academic year not extracted from PDF header." };
  if (!input.ivForYearOutcome) return { readiness: "ATTN", reason: `No IV record found for academic year ${input.headerYear}.` };
  if (input.ivForYearOutcome === "REJECTED") return { readiness: "BLOCKED", reason: "IV outcome is REJECTED." };
  if (input.ivForYearOutcome === "CHANGES_REQUIRED") return { readiness: "ATTN", reason: "IV outcome is CHANGES REQUIRED." };
  return { readiness: "READY", reason: "Ready for grading (locked spec + locked brief + IV approved)." };
}

