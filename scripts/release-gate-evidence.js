#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function toStamp(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

function runStep(step) {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const run = spawnSync("pnpm", step.args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  const ended = Date.now();
  const endedAt = new Date(ended).toISOString();
  const status = typeof run.status === "number" ? run.status : 1;
  const spawnError = run.error ? String(run.error.message || run.error) : null;
  return {
    id: step.id,
    command: `pnpm ${step.args.join(" ")}`,
    startedAt,
    endedAt,
    durationMs: ended - started,
    status,
    ok: status === 0 && !spawnError,
    spawnError,
  };
}

function main() {
  const now = new Date();
  const steps = [
    { id: "tsc", args: ["exec", "tsc", "--noEmit", "--incremental", "false"] },
    { id: "regression_pack", args: ["run", "test:regression-pack"] },
    { id: "export_pack_validation", args: ["run", "test:export-pack-validation"] },
    { id: "storage_deployment_contract", args: ["run", "ops:storage-contract"] },
    { id: "password_recovery_email_contract", args: ["run", "ops:password-recovery-contract"] },
    { id: "email_webhook_contract", args: ["run", "ops:email-webhook-contract"] },
    { id: "runtime_readiness_contract", args: ["run", "ops:readiness-contract"] },
    { id: "email_webhook_smoke", args: ["run", "ops:email-webhook-smoke"] },
    { id: "deploy_smoke", args: ["run", "ops:deploy-smoke"] },
  ];

  const result = {
    generatedAt: now.toISOString(),
    gate: "release",
    steps: [],
    summary: {
      ok: true,
      failedStep: null,
      totalSteps: steps.length,
      passedSteps: 0,
    },
  };

  for (const step of steps) {
    const stepResult = runStep(step);
    result.steps.push(stepResult);
    if (!stepResult.ok) {
      result.summary.ok = false;
      result.summary.failedStep = step.id;
      break;
    }
    result.summary.passedSteps += 1;
  }

  const relDir = path.join("docs", "evidence", "release-gate");
  const absDir = path.join(process.cwd(), relDir);
  ensureDir(absDir);
  const relPath = path.join(relDir, `${toStamp(now)}.json`).replace(/\\/g, "/");
  fs.writeFileSync(path.join(process.cwd(), relPath), `${JSON.stringify(result, null, 2)}\n`, "utf8");

  if (!result.summary.ok) {
    console.error(`release gate failed at step: ${result.summary.failedStep}`);
    console.error(`evidence: ${relPath}`);
    process.exit(1);
  }
  console.log(`release gate passed: ${relPath}`);
}

main();
