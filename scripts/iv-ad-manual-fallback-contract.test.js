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
  const generateRoute = read("app/api/admin/iv-ad/generate/route.ts");
  const page = read("app/admin/iv-ad/page.tsx");
  const regressionPack = read("scripts/regression-pack.js");

  expectContains(generateRoute, "useAiReview", "iv-ad generate route");
  expectContains(generateRoute, "aiReviewReason", "iv-ad generate route");
  expectContains(generateRoute, 'usedNarrativeSource: aiReview ? "AI" : "HEURISTIC"', "iv-ad generate route");
  expectContains(generateRoute, "reviewDraftOverride", "iv-ad generate route");

  expectContains(page, "const canGenerate = useMemo(() => {", "iv-ad page");
  expectContains(page, "AI review unavailable", "iv-ad page");
  expectContains(page, "Heuristic narrative was used.", "iv-ad page");
  expectContains(page, "No draft yet. Use Run AI IV Review to generate one.", "iv-ad page");

  expectContains(regressionPack, "iv-ad-manual-fallback-contract.test.js", "regression pack");

  console.log("iv-ad manual fallback contract tests passed.");
}

main();
