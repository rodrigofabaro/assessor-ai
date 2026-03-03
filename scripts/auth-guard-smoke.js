#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");

function parseArgs(argv) {
  return {
    baseUrl: (() => {
      const idx = argv.findIndex((a) => a === "--base-url");
      return idx >= 0 ? String(argv[idx + 1] || "").trim() : "";
    })(),
    dryRun: argv.includes("--dry-run"),
  };
}

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

async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function cookieFetch(baseUrl, cookieState, url, init = {}) {
  const cookie = cookieState.cookie || "";
  const headers = new Headers(init.headers || {});
  if (cookie) headers.set("cookie", cookie);
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const first = setCookie.split(";")[0];
    cookieState.cookie = first;
  }
  const body = await readJson(res);
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}

async function buildPdfFile() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]).drawText("auth guard smoke upload");
  const bytes = await doc.save();
  return new File([bytes], `auth-guard-smoke-${Date.now()}.pdf`, { type: "application/pdf" });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args.baseUrl || process.env.AUTH_SMOKE_BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
  if (args.dryRun) {
    console.log(`auth guard smoke dry-run ok: baseUrl=${baseUrl}`);
    return;
  }

  if (!/^(1|true|yes|on)$/i.test(String(process.env.AUTH_GUARDS_ENABLED || "").trim())) {
    console.error("auth guard smoke requires AUTH_GUARDS_ENABLED=true in server environment.");
    process.exit(1);
  }

  const evidence = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    checks: [],
    result: { ok: false, message: "" },
  };

  try {
    const adminUrl = `${baseUrl}/api/admin/app-config`;
    const studentsUrl = `${baseUrl}/api/students?query=TS001`;
    const uploadUrl = `${baseUrl}/api/submissions/upload`;
    const bootstrapUrl = `${baseUrl}/api/auth/session/bootstrap`;

    // 1) Unauthenticated admin route -> 401
    {
      const r = await fetch(adminUrl, { redirect: "manual" });
      evidence.checks.push({ id: "unauth_admin_api", expected: 401, actual: r.status, ok: r.status === 401 });
    }

    // 2) IV header on admin route -> 403
    {
      const r = await fetch(adminUrl, { headers: { "x-assessor-role": "IV" }, redirect: "manual" });
      evidence.checks.push({ id: "iv_admin_api_forbidden", expected: 403, actual: r.status, ok: r.status === 403 });
    }

    // 3) ADMIN header on admin route -> not blocked by guard (not 401/403)
    {
      const r = await fetch(adminUrl, { headers: { "x-assessor-role": "ADMIN" }, redirect: "manual" });
      const ok = r.status !== 401 && r.status !== 403;
      evidence.checks.push({ id: "admin_header_admin_api_allowed_by_guard", expected: "not 401/403", actual: r.status, ok });
    }

    // 4) Unauthenticated students route -> 401
    {
      const r = await fetch(studentsUrl, { redirect: "manual" });
      evidence.checks.push({ id: "unauth_students_api", expected: 401, actual: r.status, ok: r.status === 401 });
    }

    // 5) ASSessor header students route -> not blocked by guard (not 401/403)
    {
      const r = await fetch(studentsUrl, { headers: { "x-assessor-role": "ASSESSOR" }, redirect: "manual" });
      const ok = r.status !== 401 && r.status !== 403;
      evidence.checks.push({ id: "assessor_students_api_allowed_by_guard", expected: "not 401/403", actual: r.status, ok });
    }

    // 6) Session bootstrap + cookie access for submissions upload (guard-level allow)
    {
      const cookieState = { cookie: "" };
      const boot = await cookieFetch(baseUrl, cookieState, bootstrapUrl, { method: "POST" });
      evidence.checks.push({
        id: "session_bootstrap",
        expected: 200,
        actual: boot.status,
        ok: boot.status === 200,
        role: boot.body?.role || null,
      });

      const pdf = await buildPdfFile();
      const form = new FormData();
      form.append("files", pdf);
      const up = await cookieFetch(baseUrl, cookieState, uploadUrl, { method: "POST", body: form });
      const allowedByGuard = up.status !== 401 && up.status !== 403;
      evidence.checks.push({
        id: "session_cookie_submissions_upload_allowed_by_guard",
        expected: "not 401/403",
        actual: up.status,
        ok: allowedByGuard,
      });
    }

    const failed = evidence.checks.filter((c) => !c.ok);
    evidence.result = failed.length
      ? { ok: false, message: `${failed.length} guard checks failed.` }
      : { ok: true, message: "auth guard smoke passed" };
  } catch (e) {
    evidence.result = { ok: false, message: String(e?.message || e) };
  }

  const relDir = path.join("docs", "evidence", "auth-guard-smoke");
  ensureDir(path.join(process.cwd(), relDir));
  const relPath = path.join(relDir, `${toStamp(new Date())}.json`).replace(/\\/g, "/");
  fs.writeFileSync(path.join(process.cwd(), relPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  if (!evidence.result.ok) {
    console.error(`auth guard smoke failed: ${evidence.result.message}`);
    console.error(`evidence: ${relPath}`);
    process.exit(1);
  }
  console.log(`auth guard smoke passed: ${relPath}`);
}

main().catch((e) => {
  console.error(`auth guard smoke crashed: ${String(e?.message || e)}`);
  process.exit(1);
});
