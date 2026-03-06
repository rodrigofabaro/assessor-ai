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
  const batchRoute = read("app/api/submissions/batch-grade/route.ts");
  const qaRoute = read("app/api/admin/ops/qa-reliability/route.ts");
  const developerPage = read("app/admin/developer/DeveloperPageClient.tsx");
  const regressionPack = read("scripts/regression-pack.js");

  expectContains(batchRoute, "qaReliability", "batch-grade route");
  expectContains(batchRoute, "batchDurationMs", "batch-grade route");
  expectContains(batchRoute, "perSubmissionDurationMs", "batch-grade route");

  expectContains(qaRoute, "BATCH_GRADE_RUN", "qa reliability route");
  expectContains(qaRoute, "summary", "qa reliability route");
  expectContains(qaRoute, "Only SUPER_ADMIN", "qa reliability route");

  expectContains(developerPage, "/api/admin/ops/qa-reliability", "developer page");
  expectContains(developerPage, "QA reliability telemetry", "developer page");

  expectContains(regressionPack, "qa-reliability-contract.test.js", "regression pack");

  console.log("qa reliability contract tests passed.");
}

main();
