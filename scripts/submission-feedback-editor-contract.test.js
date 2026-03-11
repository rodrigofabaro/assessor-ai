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

  console.log("submission feedback editor contract tests passed.");
}

main();
