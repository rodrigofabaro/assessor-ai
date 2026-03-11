import { stripHigherGradeDuplicateBullets } from "@/lib/grading/higherGradeFeedback";

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
  criterionOutcomeSummary?: string;
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
  "{criterionOutcomeSummary}",
] as const;
export const FEEDBACK_TEMPLATE_ALL_TOKENS = [
  ...FEEDBACK_TEMPLATE_REQUIRED_TOKENS,
  ...FEEDBACK_TEMPLATE_OPTIONAL_TOKENS,
] as const;

const DEFAULT_TEMPLATE = [
  "Hello {studentFirstName},",
  "",
  "Overall summary",
  "{feedbackSummary}",
  "",
  "Criteria and evidence",
  "{criterionOutcomeSummary}",
  "",
  "Improvement priorities",
  "{feedbackBullets}",
  "",
  "Next steps",
  "{higherGradeGuidance}",
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

function splitParagraphs(text: string) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n\s*\n/)
    .map((part) => clean(part))
    .filter(Boolean);
}

function isFeedbackSectionHeading(text: string) {
  return /^(overall summary|criteria and evidence|improvement priorities|next steps)$/i.test(clean(text));
}

function isFeedbackMetaLine(text: string) {
  return /^(final grade:|assessor:|date:)/i.test(clean(text));
}

function stripFeedbackSummaryPrefixNoise(text: string) {
  let next = clean(text);
  if (!next) return "";
  next = next.replace(/^(?:(?:hello\s+[^,]+,\s*)?overall summary\s*)+/i, "");
  next = next.replace(/^(hello\s+[^,]+,\s*)+/i, "");
  next = next.replace(/\b(criteria and evidence|improvement priorities|next steps|final grade:|assessor:|date:)\b[\s\S]*$/i, "");
  return clean(next);
}

export function extractFeedbackSummaryFromRenderedText(text: string) {
  const paragraphs = splitParagraphs(text);
  if (!paragraphs.length) return "";

  const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((line) => clean(line));
  const overallIdx = lines.findIndex((line) => /^overall summary$/i.test(line));
  if (overallIdx >= 0) {
    const collected: string[] = [];
    for (let i = overallIdx + 1; i < lines.length; i += 1) {
      const line = clean(lines[i]);
      if (!line) {
        if (collected.length) break;
        continue;
      }
      if (isFeedbackSectionHeading(line) || isFeedbackMetaLine(line)) break;
      collected.push(line);
    }
    const joined = stripFeedbackSummaryPrefixNoise(collected.join(" "));
    if (joined) return joined;
  }

  const candidate = paragraphs.find((part) => {
    if (/^hello\s+[^,]+,?$/i.test(part)) return false;
    if (isFeedbackSectionHeading(part) || isFeedbackMetaLine(part)) return false;
    if (/^criteria (?:achieved|still to evidence clearly):/i.test(part)) return false;
    if (/^why these are still open:/i.test(part)) return false;
    if (/^learning outcomes/i.test(part)) return false;
    if (/^[-*•]\s+/.test(part)) return false;
    return true;
  });
  return stripFeedbackSummaryPrefixNoise(String(candidate || ""));
}

export function getDefaultFeedbackTemplate() {
  return DEFAULT_TEMPLATE;
}

export function renderFeedbackTemplate(input: FeedbackTemplateInput) {
  const template = clean(input.template) || DEFAULT_TEMPLATE;
  const hasCriterionOutcomeToken = template.includes("{criterionOutcomeSummary}");
  const confidenceValue =
    typeof input.confidence === "number"
      ? input.confidence.toFixed(2)
      : clean(input.confidence ?? "");
  const higherGradeGuidance = clean(input.higherGradeGuidance);
  const criterionOutcomeSummary = clean(input.criterionOutcomeSummary);
  const filteredBullets = stripHigherGradeDuplicateBullets({
    bullets: Array.isArray(input.feedbackBullets) ? input.feedbackBullets : [],
    higherGradeGuidance,
    template,
  });
  const map: Record<string, string> = {
    studentFirstName: clean(input.studentFirstName) || "Student",
    studentFullName: clean(input.studentFullName) || clean(input.studentFirstName) || "Student",
    feedbackSummary: clean(input.feedbackSummary) || "Feedback generated.",
    feedbackBullets: bulletBlock(filteredBullets),
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
    criterionOutcomeSummary,
  };
  let rendered = template.replace(
    /\{(studentFirstName|studentFullName|feedbackSummary|feedbackBullets|overallGrade|assessorName|date|unitCode|assignmentCode|submissionId|confidence|gradingTone|gradingStrictness|higherGradeGuidance|criterionOutcomeSummary)\}/g,
    (_m, k) => map[String(k)] || ""
  );
  if (criterionOutcomeSummary && !hasCriterionOutcomeToken) {
    if (/\n\s*Final grade\s*:/i.test(rendered)) {
      rendered = rendered.replace(/\n(\s*Final grade\s*:)/i, `\n\n${criterionOutcomeSummary}\n\n$1`);
    } else {
      rendered = `${rendered}\n\n${criterionOutcomeSummary}`;
    }
  }
  return rendered;
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
