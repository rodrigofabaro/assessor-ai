export type FeedbackTemplateInput = {
  template: string;
  studentFirstName: string;
  studentFullName?: string;
  feedbackSummary: string;
  feedbackBullets: string[];
  overallGrade: string;
  assessorName: string;
  markedDate: string;
  unitCode?: string;
  assignmentCode?: string;
  submissionId?: string;
  confidence?: number | string | null;
  gradingTone?: string;
  gradingStrictness?: string;
  higherGradeGuidance?: string;
};

export const FEEDBACK_TEMPLATE_REQUIRED_TOKENS = ["{overallGrade}", "{feedbackBullets}"] as const;
export const FEEDBACK_TEMPLATE_OPTIONAL_TOKENS = [
  "{studentFirstName}",
  "{studentFullName}",
  "{feedbackSummary}",
  "{assessorName}",
  "{date}",
  "{unitCode}",
  "{assignmentCode}",
  "{submissionId}",
  "{confidence}",
  "{gradingTone}",
  "{gradingStrictness}",
  "{higherGradeGuidance}",
] as const;
export const FEEDBACK_TEMPLATE_ALL_TOKENS = [
  ...FEEDBACK_TEMPLATE_REQUIRED_TOKENS,
  ...FEEDBACK_TEMPLATE_OPTIONAL_TOKENS,
] as const;

const DEFAULT_TEMPLATE = [
  "Hello {studentFirstName},",
  "",
  "{feedbackSummary}",
  "",
  "{feedbackBullets}",
  "",
  "Final grade: {overallGrade}",
  "",
  "Assessor: {assessorName}",
  "Date: {date}",
].join("\n");

function clean(v: unknown) {
  return String(v || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function bulletBlock(bullets: string[]) {
  const list = (Array.isArray(bullets) ? bullets : [])
    .map((b) => String(b || "").trim())
    .filter(Boolean);
  return list.length ? list.map((b) => `- ${b}`).join("\n") : "- Feedback generated.";
}

export function getDefaultFeedbackTemplate() {
  return DEFAULT_TEMPLATE;
}

export function renderFeedbackTemplate(input: FeedbackTemplateInput) {
  const template = clean(input.template) || DEFAULT_TEMPLATE;
  const confidenceValue =
    typeof input.confidence === "number"
      ? input.confidence.toFixed(2)
      : clean(input.confidence ?? "");
  const higherGradeGuidance = clean(input.higherGradeGuidance);
  const map: Record<string, string> = {
    studentFirstName: clean(input.studentFirstName) || "Student",
    studentFullName: clean(input.studentFullName) || clean(input.studentFirstName) || "Student",
    feedbackSummary: clean(input.feedbackSummary) || "Feedback generated.",
    feedbackBullets: bulletBlock(input.feedbackBullets),
    overallGrade: clean(input.overallGrade).toUpperCase() || "REFER",
    assessorName: clean(input.assessorName) || "Assessor",
    date: clean(input.markedDate) || new Date().toLocaleDateString("en-GB"),
    unitCode: clean(input.unitCode) || "N/A",
    assignmentCode: clean(input.assignmentCode) || "N/A",
    submissionId: clean(input.submissionId) || "N/A",
    confidence: confidenceValue || "N/A",
    gradingTone: clean(input.gradingTone) || "professional",
    gradingStrictness: clean(input.gradingStrictness) || "balanced",
    higherGradeGuidance: higherGradeGuidance || "Continue strengthening criterion-linked evidence to progress to higher bands.",
  };
  return template.replace(
    /\{(studentFirstName|studentFullName|feedbackSummary|feedbackBullets|overallGrade|assessorName|date|unitCode|assignmentCode|submissionId|confidence|gradingTone|gradingStrictness|higherGradeGuidance)\}/g,
    (_m, k) => map[String(k)] || ""
  );
}

export function deriveBulletsFromFeedbackText(text: string, maxBullets = 8) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const bullets = lines
    .filter((l) => /^[-*•]\s+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(16, maxBullets)));
  if (bullets.length) return bullets;
  const sentences = String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.slice(0, Math.max(1, Math.min(16, maxBullets)));
}

export function summarizeFeedbackText(text: string, maxLen = 180) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, Math.max(40, maxLen - 1))}…`;
}
