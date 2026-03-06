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
  const schema = read("prisma/schema.prisma");
  const turnitinConfig = read("lib/turnitin/config.ts");
  const turnitinState = read("lib/turnitin/state.ts");
  const automationPolicy = read("lib/admin/automationPolicy.ts");
  const submissionsRoute = read("app/api/submissions/route.ts");
  const batchGradeRoute = read("app/api/submissions/batch-grade/route.ts");

  expectContains(schema, "turnitinConfig    Json?", "schema");
  expectContains(schema, "automationPolicy  Json?", "schema");
  expectContains(schema, "model TurnitinSubmissionSyncState", "schema");

  expectContains(turnitinConfig, "select: { turnitinConfig: true }", "turnitin config");
  expectContains(turnitinConfig, "update: { turnitinConfig: merged }", "turnitin config");

  expectContains(turnitinState, "turnitinSubmissionSyncState", "turnitin state");
  expectContains(turnitinState, "export async function readTurnitinSubmissionStateMap", "turnitin state");

  expectContains(automationPolicy, "select: { automationPolicy: true }", "automation policy");
  expectContains(automationPolicy, "update: { automationPolicy: merged }", "automation policy");

  expectContains(submissionsRoute, "await readTurnitinSubmissionStateMap()", "submissions route");
  expectContains(batchGradeRoute, "await readAutomationPolicy()", "batch-grade route");

  console.log("turnitin/automation persistence contract tests passed.");
}

main();
