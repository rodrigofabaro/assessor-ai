#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const tests = [
  "scripts/grading-schema.test.js",
  "scripts/extraction-readiness.test.js",
  "scripts/brief-mapping-codes.test.js",
  "scripts/brief-readiness.test.js",
];

let failures = 0;
for (const testPath of tests) {
  const r = spawnSync(process.execPath, [testPath], { stdio: "inherit" });
  if (r.status !== 0) failures += 1;
}

if (failures > 0) {
  console.error(`regression pack failed (${failures} test file(s) failed).`);
  process.exit(1);
}
console.log("regression pack passed.");

