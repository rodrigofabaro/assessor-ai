const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function computeBriefReadiness(input) {
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

const base = {
  briefLocked: "2026-01-01T00:00:00.000Z",
  unitLocked: "2026-01-01T00:00:00.000Z",
  hasLinkedDoc: true,
  linkedDocLocked: "2026-01-01T00:00:00.000Z",
  headerYear: "2025-26",
  ivForYearOutcome: "APPROVED",
};

assert(computeBriefReadiness(base).readiness === "READY", "Expected READY baseline.");
assert(computeBriefReadiness({ ...base, briefLocked: null }).readiness === "BLOCKED", "Unlocked brief should be BLOCKED.");
assert(computeBriefReadiness({ ...base, hasLinkedDoc: false }).readiness === "BLOCKED", "Missing linked doc should be BLOCKED.");
assert(computeBriefReadiness({ ...base, linkedDocLocked: null }).readiness === "ATTN", "Unlocked linked doc should be ATTN.");
assert(computeBriefReadiness({ ...base, unitLocked: null }).readiness === "ATTN", "Unlocked unit spec should be ATTN.");
assert(computeBriefReadiness({ ...base, headerYear: null }).readiness === "ATTN", "Missing academic year should be ATTN.");
assert(computeBriefReadiness({ ...base, ivForYearOutcome: null }).readiness === "ATTN", "Missing IV should be ATTN.");
assert(computeBriefReadiness({ ...base, ivForYearOutcome: "CHANGES_REQUIRED" }).readiness === "ATTN", "CHANGES_REQUIRED should be ATTN.");
assert(computeBriefReadiness({ ...base, ivForYearOutcome: "REJECTED" }).readiness === "BLOCKED", "REJECTED should be BLOCKED.");

console.log("brief readiness tests passed.");

