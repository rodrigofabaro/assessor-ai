#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

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

function resolveBaseUrl() {
  const raw = String(
    process.env.READINESS_BASE_URL || process.env.DEPLOY_SMOKE_BASE_URL || "http://localhost:3000"
  )
    .trim()
    .replace(/\/+$/, "");
  return raw;
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const url = `${baseUrl}/api/health/readiness`;
  const startedAt = new Date().toISOString();
  let status = 0;
  let payload = null;
  let ok = false;
  let error = null;

  try {
    const res = await fetch(url, { cache: "no-store" });
    status = res.status;
    const text = await res.text();
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    ok = res.ok && payload && payload.ok === true;
    if (!ok) {
      error = String(payload?.message || payload?.error || `readiness endpoint returned ${status}`);
    }
  } catch (err) {
    error = String(err?.message || err);
  }

  const evidence = {
    generatedAt: new Date().toISOString(),
    startedAt,
    baseUrl,
    endpoint: "/api/health/readiness",
    status,
    ok,
    error,
    payload,
  };

  const stamp = toStamp(new Date());
  const relDir = path.join("docs", "evidence", "readiness");
  const absDir = path.join(process.cwd(), relDir);
  ensureDir(absDir);
  const relPath = path.join(relDir, `${stamp}.json`).replace(/\\/g, "/");
  fs.writeFileSync(path.join(process.cwd(), relPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  if (!ok) {
    console.error(`readiness contract failed (${status || "no-status"}): ${error || "unknown error"}`);
    console.error(`evidence: ${relPath}`);
    process.exit(1);
  }

  console.log(`readiness contract passed: ${relPath}`);
}

main().catch((err) => {
  console.error(`readiness contract crashed: ${String(err?.message || err)}`);
  process.exit(1);
});

