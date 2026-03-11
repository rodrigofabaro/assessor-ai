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
  const script = read("scripts/readiness-contract.js");
  const packageJson = read("package.json");
  const regressionPack = read("scripts/regression-pack.js");

  assert(script.includes("/api/auth/login"), "expected readiness contract auth login support");
  assert(script.includes("DEPLOY_SMOKE_USERNAME || process.env.AUTH_LOGIN_USERNAME"), "expected readiness contract to reuse smoke/auth username envs");
  assert(script.includes("headers.cookie = cookie"), "expected readiness contract to forward auth cookie");
  assert(packageJson.includes("\"test:readiness-contract-auth\""), "expected readiness auth contract test script");
  assert(regressionPack.includes("scripts/readiness-contract-auth.test.js"), "expected readiness auth contract in regression pack");

  console.log("readiness auth contract tests passed.");
}

run();
