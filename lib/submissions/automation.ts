export type AutomationState = "AUTO_READY" | "NEEDS_HUMAN" | "BLOCKED" | "COMPLETED";

type SubmissionForAutomation = {
  status?: string | null;
  studentId?: string | null;
  assignmentId?: string | null;
  extractedText?: string | null;
  _count?: {
    assessments?: number;
  } | null;
  grade?: string | null;
  overallGrade?: string | null;
  feedback?: string | null;
  markedPdfPath?: string | null;
};

function isReadyToUploadLike(s: SubmissionForAutomation): boolean {
  const grade = String(s.grade ?? s.overallGrade ?? "").trim();
  const hasFeedback = Boolean(String(s.feedback ?? "").trim());
  const hasMarkedPdf = Boolean(String(s.markedPdfPath ?? "").trim());
  return Boolean(grade && hasFeedback && hasMarkedPdf);
}

export function deriveAutomationState(s: SubmissionForAutomation): {
  state: AutomationState;
  reason: string;
} {
  const status = String(s.status || "").toUpperCase();
  const assessments = Number(s?._count?.assessments || 0);
  const extractedLen = String(s.extractedText || "").trim().length;

  if (status === "FAILED") {
    return { state: "BLOCKED", reason: "Submission failed and needs operator intervention." };
  }
  if (status === "NEEDS_OCR") {
    return { state: "BLOCKED", reason: "Extraction quality gate blocked grading (OCR required)." };
  }
  if (!s.assignmentId) {
    return { state: "NEEDS_HUMAN", reason: "No assignment linked. Resolve assignment before grading." };
  }
  if (!s.studentId) {
    return { state: "NEEDS_HUMAN", reason: "No student linked. Resolve student identity." };
  }
  if (status === "UPLOADED" || status === "EXTRACTING") {
    return { state: "NEEDS_HUMAN", reason: "Extraction not complete yet." };
  }
  if (status === "ASSESSING") {
    return { state: "NEEDS_HUMAN", reason: "Grading is currently running." };
  }
  if ((status === "DONE" && assessments > 0) || isReadyToUploadLike(s)) {
    return { state: "COMPLETED", reason: "Assessment complete with export-ready outputs." };
  }
  if (status === "EXTRACTED" && assessments === 0 && extractedLen >= 100) {
    return { state: "AUTO_READY", reason: "Ready for auto-grading with no blockers detected." };
  }

  return { state: "NEEDS_HUMAN", reason: "Requires manual review before the next action." };
}

