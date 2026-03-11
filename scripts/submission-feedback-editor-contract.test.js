#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const assert = require("node:assert");

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function expectContains(haystack, needle, label) {
  assert(haystack.includes(needle), `${label} missing expected fragment: ${needle}`);
}

function main() {
  const client = read("app/submissions/[submissionId]/SubmissionDetailClient.tsx");
  const rules = read("lib/grading/feedbackQualityRules.ts");
  const feedbackDocument = read("lib/grading/feedbackDocument.ts");

  expectContains(client, "function formatDateInputValue", "submission detail client");
  expectContains(client, "setFeedbackStudentName(defaultStudentName);", "submission detail client");
  expectContains(client, "setFeedbackMarkedDate(todayInput);", "submission detail client");
  expectContains(
    client,
    'setFeedbackBaseline({ text: "", studentName: defaultStudentName, date: todayInput });',
    "submission detail client"
  );
  expectContains(
    client,
    "const dateInput = formatDateInputValue(dateCandidate || new Date());",
    "submission detail client"
  );
  expectContains(client, "Marked-version feedback rules", "submission detail client");
  expectContains(client, "STUDENT_MARKED_FEEDBACK_RULES.map", "submission detail client");
  expectContains(rules, "Keep the overall feedback holistic across the whole assignment", "feedback quality rules");
  expectContains(feedbackDocument, "Overall summary", "feedback document template");
  expectContains(feedbackDocument, "Criteria and evidence", "feedback document template");
  expectContains(feedbackDocument, "Improvement priorities", "feedback document template");
  expectContains(feedbackDocument, "Next steps", "feedback document template");

  console.log("submission feedback editor contract tests passed.");
}

main();
