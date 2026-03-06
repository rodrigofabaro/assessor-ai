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
  const route = read("app/api/submissions/[submissionId]/route.ts");
  const client = read("app/submissions/[submissionId]/SubmissionDetailClient.tsx");
  const regressionPack = read("scripts/regression-pack.js");

  expectContains(route, "projectionRaw", "submission detail route");
  expectContains(route, "resultJson: includeAssessmentPayload", "submission detail route");
  expectContains(route, "text: includeExtractionText", "submission detail route");
  expectContains(route, "projection,", "submission detail route");

  expectContains(client, "ensureFullSubmissionProjection", "submission detail client");
  expectContains(client, "projection=${projection}", "submission detail client");
  expectContains(client, "hasFullSubmissionProjection", "submission detail client");
  expectContains(client, "Detailed extraction text loads on demand", "submission detail client");

  expectContains(regressionPack, "submission-detail-projection-contract.test.js", "regression pack");

  console.log("submission detail projection contract tests passed.");
}

main();
