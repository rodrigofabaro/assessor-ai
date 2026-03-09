#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const tests = [
  "scripts/grading-schema.test.js",
  "scripts/feedback-vascr-policy.test.js",
  "scripts/feedback-annotation-policy.test.js",
  "scripts/resend-webhook-parsing.test.js",
  "scripts/extraction-readiness.test.js",
  "scripts/brief-mapping-codes.test.js",
  "scripts/brief-template-profile.test.js",
  "scripts/brief-fidelity-report.test.js",
  "scripts/brief-grading-scope-change.test.js",
  "scripts/brief-readiness.test.js",
  "scripts/brief-scenario-warning-policy.test.js",
  "scripts/iv-ad-review-draft-schema.test.js",
  "scripts/iv-ad-manual-fallback-contract.test.js",
  "scripts/export-pack-validation.test.js",
  "scripts/auth-scaffold-contract.test.js",
  "scripts/org-scope-read-contract.test.js",
  "scripts/org-scope-session-contract.test.js",
  "scripts/org-scope-reference-boundary.test.js",
  "scripts/org-scope-reference-route-boundary.test.js",
  "scripts/org-scope-iv-boundary.test.js",
  "scripts/org-scope-assignment-iv-admin-boundary.test.js",
  "scripts/org-scope-submission-reference-ops-boundary.test.js",
  "scripts/org-scope-tenant-route-boundary.test.js",
  "scripts/org-scope-student-boundary.test.js",
  "scripts/password-recovery-contract.test.js",
  "scripts/storage-deployment-contract.test.js",
  "scripts/schema-contract.test.js",
  "scripts/favicon-persistence-contract.test.js",
  "scripts/openai-responses-contract.test.js",
  "scripts/qa-reliability-contract.test.js",
  "scripts/reference-inbox-projection-contract.test.js",
  "scripts/admin-audit-query-budget-contract.test.js",
  "scripts/submission-detail-projection-contract.test.js",
  "scripts/blob-overwrite-contract.test.js",
  "scripts/turnitin-automation-persistence-contract.test.js",
  "scripts/ui-launch-mode-contract.test.js",
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
