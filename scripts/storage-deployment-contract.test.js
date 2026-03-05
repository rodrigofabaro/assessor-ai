#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function expectContains(haystack, needle, label) {
  assert(haystack.includes(needle), `${label} missing expected fragment: ${needle}`);
}

function main() {
  const contractScript = read("scripts/storage-deployment-contract.js");
  const releaseGate = read("scripts/release-gate-evidence.js");
  const packageJson = read("package.json");
  const envExample = read(".env.example");
  const envContract = read("docs/operations/environment-contract.md");

  expectContains(contractScript, "ENV_CONTRACT_REQUIRE_STORAGE_ROOT", "storage contract script");
  expectContains(contractScript, "FILE_STORAGE_ROOT", "storage contract script");
  expectContains(contractScript, "STORAGE_BACKEND", "storage contract script");
  expectContains(contractScript, "BLOB_READ_WRITE_TOKEN", "storage contract script");

  expectContains(releaseGate, "storage_deployment_contract", "release gate");
  expectContains(packageJson, "ops:storage-contract", "package.json");
  expectContains(envExample, "ENV_CONTRACT_REQUIRE_STORAGE_ROOT=", ".env.example");
  expectContains(envExample, "STORAGE_BACKEND=", ".env.example");
  expectContains(envExample, "BLOB_READ_WRITE_TOKEN=", ".env.example");
  expectContains(envContract, "ENV_CONTRACT_REQUIRE_STORAGE_ROOT", "environment contract doc");
  expectContains(envContract, "STORAGE_BACKEND", "environment contract doc");

  console.log("storage deployment contract tests passed.");
}

main();
