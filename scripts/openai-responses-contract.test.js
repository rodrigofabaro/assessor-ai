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
  const script = read("scripts/openai-responses-contract.js");
  const releaseGate = read("scripts/release-gate-evidence.js");
  const packageJson = read("package.json");
  const envExample = read(".env.example");

  expectContains(script, "/v1/responses", "openai responses contract script");
  expectContains(script, "AUTH_REQUIRE_OPENAI_RESPONSES_WRITE", "openai responses contract script");
  expectContains(script, "OPENAI_RESPONSES_WRITE_PROBE_ENABLED", "openai responses contract script");

  expectContains(packageJson, "ops:openai-responses-contract", "package.json");
  expectContains(releaseGate, "openai_responses_contract", "release gate");
  expectContains(envExample, "AUTH_REQUIRE_OPENAI_RESPONSES_WRITE=", ".env.example");

  console.log("openai responses contract tests passed.");
}

main();

