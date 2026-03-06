#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  console.error(`feedback quality contract failed: ${message}`);
  process.exit(1);
}

function read(relPath) {
  const abs = path.join(process.cwd(), relPath);
  if (!fs.existsSync(abs)) fail(`missing required file: ${relPath}`);
  return fs.readFileSync(abs, "utf8");
}

function expectContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    fail(`${label} missing expected fragment: ${needle}`);
  }
}

function main() {
  const gradeRoute = read("app/api/submissions/[submissionId]/grade/route.ts");
  const regressionPack = read("scripts/regression-pack.js");

  expectContains(gradeRoute, "enforceFeedbackVascrPolicy", "grading route");
  expectContains(gradeRoute, "enforceFeedbackAnnotationPolicy", "grading route");
  expectContains(gradeRoute, "lintOverallFeedbackClaims", "grading route");
  expectContains(gradeRoute, "lintOverallFeedbackPearsonPolicy", "grading route");

  expectContains(regressionPack, "feedback-vascr-policy.test.js", "regression pack");
  expectContains(regressionPack, "feedback-annotation-policy.test.js", "regression pack");

  console.log("feedback quality contract passed.");
}

main();
