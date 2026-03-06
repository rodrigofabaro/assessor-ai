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
  const script = read("scripts/schema-contract.js");
  const releaseGate = read("scripts/release-gate-evidence.js");
  const packageJson = read("package.json");
  const envExample = read(".env.example");

  expectContains(script, "requiredTables", "schema contract script");
  expectContains(script, "Organization", "schema contract script");
  expectContains(script, "AppUser", "schema contract script");
  expectContains(script, "ReferenceDocument", "schema contract script");
  expectContains(script, "TurnitinSubmissionSyncState", "schema contract script");
  expectContains(script, "AppConfig\", \"turnitinConfig", "schema contract script");
  expectContains(script, "AppConfig\", \"automationPolicy", "schema contract script");
  expectContains(script, "AUTH_REQUIRE_SCHEMA_CONTRACT", "schema contract script");

  expectContains(packageJson, "ops:schema-contract", "package.json");
  expectContains(releaseGate, "database_schema_contract", "release gate");
  expectContains(envExample, "AUTH_REQUIRE_SCHEMA_CONTRACT=", ".env.example");

  console.log("schema contract tests passed.");
}

main();
