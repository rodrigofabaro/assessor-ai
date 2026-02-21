export type AutomationState = "AUTO_READY" | "NEEDS_HUMAN" | "BLOCKED" | "COMPLETED";
export type AutomationExceptionCode =
  | "SUBMISSION_FAILED"
  | "EXTRACT_NEEDS_OCR"
  | "MISSING_ASSIGNMENT_LINK"
  | "MISSING_BRIEF_LINK"
  | "MISSING_STUDENT_LINK"
  | "EXTRACTION_IN_PROGRESS"
  | "EXTRACTION_LOW_QUALITY_BLOCKED"
  | "EXTRACTION_LOW_QUALITY_REVIEW"
  | "GRADING_IN_PROGRESS"
  | "READY_FOR_GRADING"
  | "ASSESSMENT_OUTPUTS_INCOMPLETE"
  | "COMPLETED_EXPORT_READY"
  | "MANUAL_REVIEW_REQUIRED";

type SubmissionForAutomation = {
  status?: string | null;
  studentId?: string | null;
  assignmentId?: string | null;
  assignmentBriefId?: string | null;
  extractedText?: string | null;
  _count?: {
    assessments?: number;
  } | null;
  grade?: string | null;
  overallGrade?: string | null;
  feedback?: string | null;
  markedPdfPath?: string | null;
  extractionQuality?: {
    score: number;
    band: "HIGH" | "MEDIUM" | "LOW";
    routeHint: "AUTO_READY" | "NEEDS_REVIEW" | "BLOCKED";
  } | null;
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
  exceptionCode: AutomationExceptionCode;
  recommendedAction: string;
} {
  const status = String(s.status || "").toUpperCase();
  const assessments = Number(s?._count?.assessments || 0);

  if (status === "FAILED") {
    return {
      state: "BLOCKED",
      reason: "Submission failed and needs operator intervention.",
      exceptionCode: "SUBMISSION_FAILED",
      recommendedAction: "Open submission and inspect failure details before retry.",
    };
  }
  if (status === "NEEDS_OCR") {
    return {
      state: "BLOCKED",
      reason: "Extraction quality gate blocked grading (OCR required).",
      exceptionCode: "EXTRACT_NEEDS_OCR",
      recommendedAction: "Re-run extraction with better source quality or OCR path.",
    };
  }
  if (!s.assignmentId) {
    return {
      state: "NEEDS_HUMAN",
      reason: "No assignment linked. Resolve assignment before grading.",
      exceptionCode: "MISSING_ASSIGNMENT_LINK",
      recommendedAction: "Link the correct assignment/brief before grading.",
    };
  }
  if (s.assignmentBriefId === null) {
    return {
      state: "NEEDS_HUMAN",
      reason: "No assignment brief linked. Resolve brief mapping before grading.",
      exceptionCode: "MISSING_BRIEF_LINK",
      recommendedAction: "Link the correct assignment brief before grading.",
    };
  }
  if (!s.studentId) {
    return {
      state: "NEEDS_HUMAN",
      reason: "No student linked. Resolve student identity.",
      exceptionCode: "MISSING_STUDENT_LINK",
      recommendedAction: "Use Resolve to link the correct student.",
    };
  }
  if (status === "UPLOADED" || status === "EXTRACTING") {
    return {
      state: "NEEDS_HUMAN",
      reason: "Extraction not complete yet.",
      exceptionCode: "EXTRACTION_IN_PROGRESS",
      recommendedAction: "Wait for extraction to complete, then refresh queue.",
    };
  }
  if (status === "ASSESSING") {
    return {
      state: "NEEDS_HUMAN",
      reason: "Grading is currently running.",
      exceptionCode: "GRADING_IN_PROGRESS",
      recommendedAction: "Wait for grading completion and review result.",
    };
  }
  if ((status === "EXTRACTED" || status === "DONE") && assessments === 0) {
    const quality = s.extractionQuality || null;
    if (quality?.routeHint === "BLOCKED") {
      return {
        state: "BLOCKED",
        reason: `Extraction quality score too low (${quality.score}/100).`,
        exceptionCode: "EXTRACTION_LOW_QUALITY_BLOCKED",
        recommendedAction: "Re-run extraction/OCR and review source quality before grading.",
      };
    }
    if (quality?.routeHint === "NEEDS_REVIEW") {
      return {
        state: "NEEDS_HUMAN",
        reason: `Extraction quality needs review (${quality.score}/100).`,
        exceptionCode: "EXTRACTION_LOW_QUALITY_REVIEW",
        recommendedAction: "Review extracted pages and triage warnings before grading.",
      };
    }
  }
  if (isReadyToUploadLike(s)) {
    return {
      state: "COMPLETED",
      reason: "Assessment complete with export-ready outputs.",
      exceptionCode: "COMPLETED_EXPORT_READY",
      recommendedAction: "Ready for export/handoff.",
    };
  }
  if (status === "DONE" && assessments > 0) {
    return {
      state: "NEEDS_HUMAN",
      reason: "Assessment exists, but export outputs are incomplete.",
      exceptionCode: "ASSESSMENT_OUTPUTS_INCOMPLETE",
      recommendedAction: "Open submission, regenerate feedback/marked PDF, and verify handoff readiness.",
    };
  }
  if (status === "EXTRACTED" && assessments === 0) {
    return {
      state: "AUTO_READY",
      reason: "Ready for auto-grading with no blockers detected.",
      exceptionCode: "READY_FOR_GRADING",
      recommendedAction: "Queue grading now.",
    };
  }

  return {
    state: "NEEDS_HUMAN",
    reason: "Requires manual review before the next action.",
    exceptionCode: "MANUAL_REVIEW_REQUIRED",
    recommendedAction: "Open submission and validate missing context.",
  };
}
