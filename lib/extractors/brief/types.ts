export type BriefHeader = {
  qualification?: string | null;
  unitNumberAndTitle?: string | null;
  assignmentTitle?: string | null;
  assignment?: string | null;
  assessor?: string | null;
  unitCode?: string | null;
  internalVerifier?: string | null;
  verificationDate?: string | null;
  verificationDateIso?: string | null;
  issueDate?: string | null;
  issueDateIso?: string | null;
  finalSubmissionDate?: string | null;
  finalSubmissionDateIso?: string | null;
  academicYear?: string | null;
  warnings?: string[];
};

export type BriefTask = {
  n: number;
  label: string;
  title?: string | null;
  aias?: string | null;
  pages?: number[];
  text: string;
  prompt?: string;
  parts?: Array<{ key: string; text: string }>;
  warnings?: string[];
  confidence?: "CLEAN" | "HEURISTIC";
};

export type BriefEndMatter = {
  sourcesBlock: string | null;
  criteriaBlock: string | null;
};

export type BriefTasksResult = {
  tasks: BriefTask[];
  warnings: string[];
  endMatter: BriefEndMatter | null;
};
