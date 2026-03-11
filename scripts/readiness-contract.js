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

function toSafeString(value) {
  return String(value || "").trim();
}

function firstCookiePair(setCookie) {
  return String(setCookie || "").split(";")[0].trim();
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const authUsername = toSafeString(process.env.DEPLOY_SMOKE_USERNAME || process.env.AUTH_LOGIN_USERNAME);
  const authPassword = toSafeString(process.env.DEPLOY_SMOKE_PASSWORD || process.env.AUTH_LOGIN_PASSWORD);
  const url = `${baseUrl}/api/health/readiness`;
  const startedAt = new Date().toISOString();
  let status = 0;
  let payload = null;
  let ok = false;
  let error = null;
  let auth = { attempted: false, authenticated: false, status: 0 };

  try {
    const headers = {};
    if (authUsername && authPassword) {
      auth.attempted = true;
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });
      auth.status = loginRes.status;
      const cookie = firstCookiePair(loginRes.headers.get("set-cookie"));
      if (loginRes.ok && cookie) {
        headers.cookie = cookie;
        auth.authenticated = true;
      } else if (!loginRes.ok) {
        const text = await loginRes.text().catch(() => "");
        throw new Error(`Readiness auth login failed (${loginRes.status}): ${text || "unknown error"}`);
      }
    }

    const res = await fetch(url, { cache: "no-store", headers });
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
    auth,
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
