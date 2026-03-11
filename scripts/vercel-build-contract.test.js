#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const script = read("scripts/vercel-build.cjs");
  const packageJson = read("package.json");
  const regressionPack = read("scripts/regression-pack.js");

  assert(script.includes("const productionDefault = env === \"production\";"), "expected production migrate default in vercel build script");
  assert(script.includes("const explicitSkip = skipMigrateFlag === \"1\" || skipMigrateFlag === \"true\";"), "expected explicit skip flag in vercel build script");
  assert(script.includes("default production behavior"), "expected production migration log reason in vercel build script");
  assert(script.includes("PRISMA_SKIP_MIGRATE_ON_BUILD"), "expected PRISMA_SKIP_MIGRATE_ON_BUILD support in vercel build script");
  assert(packageJson.includes("\"test:vercel-build-contract\""), "expected package.json test script for vercel build contract");
  assert(regressionPack.includes("scripts/vercel-build-contract.test.js"), "expected vercel build contract in regression pack");

  console.log("vercel build contract tests passed.");
}

run();
