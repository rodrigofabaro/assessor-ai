export type Student = {
  id: string;
  fullName: string | null;
  email: string | null;
  externalRef: string | null;
  courseName: string | null;
};

export type SubmissionRow = {
  id: string;
  filename: string;
  uploadedAt: string;
  status: string;

  extractedText?: string | null;

  assignmentId: string | null;
  assignment?: { title: string | null } | null;

  studentId: string | null;
  student?: Student | null;

  _count?: { extractionRuns: number; assessments: number };

  // Phase 4+ (optional outputs — safe if backend doesn't send yet)
  grade?: string | null;
  overallGrade?: string | null;
  feedback?: string | null;
  markedPdfPath?: string | null;
  gradedAt?: string | null;
  updatedAt?: string | null;
  automationState?: "AUTO_READY" | "NEEDS_HUMAN" | "BLOCKED" | "COMPLETED" | null;
  automationReason?: string | null;
};

export type TriageResponse = {
  submission: SubmissionRow;
  triage: {
    studentName: string | null;
    email: string | null;
    sampleLines: string[];
    warnings: string[];
    coverage?: any;
  };
};
