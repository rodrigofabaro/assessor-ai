export const STUDENT_MARKED_FEEDBACK_RULES = [
  "Keep the overall feedback holistic across the whole assignment, not as isolated page comments only.",
  "Separate strengths, evidence gaps, technical weaknesses, and presentation issues so the student knows what type of fix is needed.",
  "Use criterion-led wording where appropriate and make clear whether evidence is sufficient or still partial.",
  "Avoid vague phrases such as 'add more detail'; say exactly what evidence, explanation, comparison, or conclusion is missing.",
  "Explain why each weakness matters to the assessment decision so the feedback remains moderation-safe.",
  "Give feed-forward next steps that the student can act on in the marked version and any resubmission.",
];

export function formatStudentMarkedFeedbackRules() {
  return STUDENT_MARKED_FEEDBACK_RULES.map((rule) => `- ${rule}`).join("\n");
}
