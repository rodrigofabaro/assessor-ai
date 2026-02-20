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
  assignment?: {
    title: string | null;
    unitCode?: string | null;
    assignmentRef?: string | null;
  } | null;

  studentId: string | null;
  student?: Student | null;

  _count?: { extractionRuns: number; assessments: number };

  // Phase 4+ (optional outputs — safe if backend doesn't send yet)
  grade?: string | null;
  overallGrade?: string | null;
  feedback?: string | null;
  markedPdfPath?: string | null;
  gradedAt?: string | null;
  assessmentActor?: string | null;
  updatedAt?: string | null;
  automationState?: "AUTO_READY" | "NEEDS_HUMAN" | "BLOCKED" | "COMPLETED" | null;
  automationReason?: string | null;
  automationExceptionCode?: string | null;
  automationRecommendedAction?: string | null;
  extractionMode?: "COVER_ONLY" | "FULL" | null;
  coverReady?: boolean | null;
  extractionQuality?: {
    score: number;
    band: "HIGH" | "MEDIUM" | "LOW";
    routeHint: "AUTO_READY" | "NEEDS_REVIEW" | "BLOCKED";
    ready: boolean;
    blockers: string[];
    warnings: string[];
    metrics: {
      extractedChars: number;
      pageCount: number;
      overallConfidence: number;
      runStatus: string;
      coverMetadataReady: boolean;
      extractionMode: string;
    };
  } | null;
  qaFlags?: {
    shouldReview: boolean;
    reasons: string[];
    metrics: {
      gradingConfidence: number | null;
      extractionConfidence: number | null;
      totalCitations: number;
      criteriaWithoutEvidence: number;
      rerunDriftDetected: boolean;
    };
  } | null;
  turnitin?: {
    turnitinSubmissionId?: string | null;
    status?: string | null;
    aiWritingPercentage?: number | null;
    overallMatchPercentage?: number | null;
    internetMatchPercentage?: number | null;
    publicationMatchPercentage?: number | null;
    submittedWorksMatchPercentage?: number | null;
    reportRequestedAt?: string | null;
    reportGeneratedAt?: string | null;
    viewerUrl?: string | null;
    lastError?: string | null;
    updatedAt?: string | null;
  } | null;
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

export type PaginatedResponse<T> = {
  items: T[];
  pageInfo: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};
