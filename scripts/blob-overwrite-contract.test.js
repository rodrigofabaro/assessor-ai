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
  const storageProvider = read("lib/storage/provider.ts");
  const regressionPack = read("scripts/regression-pack.js");

  expectContains(storageProvider, "allowOverwrite: options?.allowOverwrite ?? true", "storage provider");
  expectContains(storageProvider, "addRandomSuffix: false", "storage provider");
  expectContains(storageProvider, "export async function writeStorageFile(", "storage provider");

  expectContains(regressionPack, "blob-overwrite-contract.test.js", "regression pack");

  console.log("blob overwrite contract tests passed.");
}

main();
