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
  const cronRoute = read("app/api/cron/submission-automation/route.ts");
  const authHelper = read("lib/submissions/automationRunnerAuth.ts");
  const vercelConfig = read("vercel.json");

  assert(cronRoute.includes("isSubmissionAutomationCronAuthorized"), "expected cron route to enforce automation-runner authorization");
  assert(cronRoute.includes("runDueSubmissionAutomationJobs"), "expected cron route to execute queued submission automation jobs");
  assert(authHelper.includes("x-vercel-cron"), "expected automation cron auth helper to allow Vercel cron requests");
  assert(authHelper.includes("SUBMISSION_AUTOMATION_CRON_SECRET"), "expected automation cron auth helper to support bearer-secret fallback");
  assert(vercelConfig.includes("\"/api/cron/submission-automation\""), "expected vercel cron config for submission automation route");
  assert(vercelConfig.includes("\"* * * * *\""), "expected submission automation cron to run every minute");

  console.log("submission automation cron contract tests passed.");
}

run();
