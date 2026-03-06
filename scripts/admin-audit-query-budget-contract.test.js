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
  const route = read("app/api/admin/audit/route.ts");
  const regressionPack = read("scripts/regression-pack.js");

  expectContains(route, "dynamicQueryTake", "admin audit route");
  expectContains(route, "wantsLinkEvents", "admin audit route");
  expectContains(route, "wantsExtractionEvents", "admin audit route");
  expectContains(route, "wantsGradeEvents", "admin audit route");
  expectContains(route, "Promise.resolve([])", "admin audit route");
  expectContains(route, "submissionSummarySelect", "admin audit route");

  expectContains(regressionPack, "admin-audit-query-budget-contract.test.js", "regression pack");

  console.log("admin audit query budget contract tests passed.");
}

main();
