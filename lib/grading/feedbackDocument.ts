export type FeedbackTemplateInput = {
  template: string;
  studentFirstName: string;
  feedbackSummary: string;
  feedbackBullets: string[];
  overallGrade: string;
  assessorName: string;
  markedDate: string;
};

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
  const map: Record<string, string> = {
    studentFirstName: clean(input.studentFirstName) || "Student",
    feedbackSummary: clean(input.feedbackSummary) || "Feedback generated.",
    feedbackBullets: bulletBlock(input.feedbackBullets),
    overallGrade: clean(input.overallGrade).toUpperCase() || "REFER",
    assessorName: clean(input.assessorName) || "Assessor",
    date: clean(input.markedDate) || new Date().toLocaleDateString("en-GB"),
  };
  return template.replace(/\{(studentFirstName|feedbackSummary|feedbackBullets|overallGrade|assessorName|date)\}/g, (_m, k) => map[String(k)] || "");
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
