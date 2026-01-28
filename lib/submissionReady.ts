export type TotaraSummarySource = {
  filename: string;
  uploadedAt?: string | null;
  gradedAt?: string | null;
  updatedAt?: string | null;

  // grading outputs (optional until Phase 4 lands)
  grade?: string | null;
  overallGrade?: string | null;
  feedback?: string | null;
  markedPdfPath?: string | null;
};

/**
 * Derived readiness:
 * "Ready to upload" means it is exportable (grade + feedback + marked PDF exist).
 * This stays derived (UI-only) so we don't add new DB state.
 */
export function isReadyToUpload(s: TotaraSummarySource): boolean {
  const grade = (s.grade ?? s.overallGrade ?? "").trim();
  const hasGrade = grade.length > 0;
  const hasFeedback = Boolean((s.feedback ?? "").trim());
  const hasMarkedPdf = Boolean((s.markedPdfPath ?? "").trim());
  return hasGrade && hasFeedback && hasMarkedPdf;
}

/**
 * Canonical Totara notes format (plain text).
 * Keep it stable so tutors build muscle memory.
 */
export function buildCopySummary(s: TotaraSummarySource): string {
  const grade = (s.grade ?? s.overallGrade ?? "—").toString().toUpperCase();
  const dateSource = s.gradedAt ?? s.updatedAt ?? s.uploadedAt ?? null;

  let markedDate = "—";
  if (dateSource) {
    const d = new Date(dateSource);
    if (!Number.isNaN(d.getTime())) {
      markedDate = d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  }

  return `File: ${s.filename}
Grade: ${grade}
Marked: ${markedDate}`;
}
