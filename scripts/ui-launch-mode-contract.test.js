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
  const topNav = read("components/TopNav.tsx");
  const envExample = read(".env.example");
  const regressionPack = read("scripts/regression-pack.js");

  expectContains(topNav, "NEXT_PUBLIC_UI_LAUNCH_MODE", "TopNav");
  expectContains(topNav, "ADMIN_USERS_ITEM", "TopNav");
  expectContains(topNav, "if (launchModeEnabled) nextItems.push(ADMIN_USERS_ITEM);", "TopNav");
  expectContains(envExample, "NEXT_PUBLIC_UI_LAUNCH_MODE=false", ".env.example");
  expectContains(regressionPack, "ui-launch-mode-contract.test.js", "regression pack");

  console.log("ui launch-mode contract tests passed.");
}

main();
