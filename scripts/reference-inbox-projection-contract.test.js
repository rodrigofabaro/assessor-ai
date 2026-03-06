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
  const logic = read("app/admin/reference/reference.logic.ts");
  const detailRoute = read("app/api/reference-documents/[documentId]/route.ts");
  const page = read("app/admin/reference/page.tsx");
  const regressionPack = read("scripts/regression-pack.js");

  expectContains(logic, 'params.set("extracted", "summary")', "reference logic");
  expectContains(logic, "/api/reference-documents/${encodeURIComponent(id)}", "reference logic");
  expectContains(logic, "hasFullExtractedProjection", "reference logic");

  expectContains(detailRoute, "export async function GET", "reference document detail route");
  expectContains(detailRoute, "extractedJson: true", "reference document detail route");

  expectContains(page, "Loading full extracted preview for this document...", "reference page");

  expectContains(regressionPack, "reference-inbox-projection-contract.test.js", "regression pack");

  console.log("reference inbox projection contract tests passed.");
}

main();
