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
  const schema = read("prisma/schema.prisma");
  const queueLib = read("lib/submissions/automationQueue.ts");
  const runnerRoute = read("app/api/submissions/automation-jobs/run/route.ts");
  const uploadRoute = read("app/api/submissions/upload/route.ts");
  const blobFinalizeRoute = read("app/api/submissions/blob-finalize/route.ts");
  const autoGrade = read("lib/submissions/autoGrade.ts");

  assert(schema.includes("model SubmissionAutomationJob {"), "expected SubmissionAutomationJob model in prisma schema");
  assert(schema.includes("enum SubmissionAutomationJobType {"), "expected SubmissionAutomationJobType enum in prisma schema");
  assert(queueLib.includes("enqueueSubmissionAutomationJob"), "expected queue helper to expose enqueueSubmissionAutomationJob");
  assert(queueLib.includes("runDueSubmissionAutomationJobs"), "expected queue helper to expose runDueSubmissionAutomationJobs");
  assert(runnerRoute.includes("runDueSubmissionAutomationJobs"), "expected runner route to execute queued automation jobs");
  assert(uploadRoute.includes("enqueueSubmissionAutomationJob"), "expected upload route to enqueue extraction jobs");
  assert(blobFinalizeRoute.includes("enqueueSubmissionAutomationJob"), "expected blob finalize route to enqueue extraction jobs");
  assert(autoGrade.includes("enqueueSubmissionAutomationJob"), "expected auto-grade helper to enqueue grading jobs");
  assert(!uploadRoute.includes("/api/submissions/${s.id}/extract"), "expected upload route to stop directly calling submission extract route");
  assert(!blobFinalizeRoute.includes("/api/submissions/${submission.id}/extract"), "expected blob finalize route to stop directly calling submission extract route");

  console.log("submission automation queue contract tests passed.");
}

run();
