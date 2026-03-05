#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const getFlagValue = (flag) => {
    const idx = argv.findIndex((a) => a === flag);
    return idx >= 0 ? String(argv[idx + 1] || "").trim() : "";
  };
  return {
    dryRun: argv.includes("--dry-run"),
    to: getFlagValue("--to"),
    subject: getFlagValue("--subject"),
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

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

function resolveProvider() {
  const raw = String(process.env.AUTH_INVITE_EMAIL_PROVIDER || process.env.AUTH_EMAIL_PROVIDER || "none")
    .trim()
    .toLowerCase();
  if (raw === "resend") return "resend";
  return "none";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const provider = resolveProvider();
  const requireAlertEmail = isTruthy(process.env.AUTH_REQUIRE_ALERT_EMAIL);

  const to = String(args.to || process.env.ALERT_EMAIL_TO || "").trim().toLowerCase();
  const from = String(process.env.ALERT_EMAIL_FROM || process.env.AUTH_EMAIL_FROM || "").trim();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const subject = String(args.subject || "Assessor AI alert channel smoke test").trim();
  const text = [
    "Assessor AI operational alert smoke test.",
    "",
    "If you received this message, alert-channel delivery is configured correctly.",
    `Timestamp (UTC): ${now.toISOString()}`,
  ].join("\n");

  const evidence = {
    generatedAt: now.toISOString(),
    gate: "ops-alert-smoke",
    provider,
    requireAlertEmail,
    dryRun: args.dryRun,
    target: to || null,
    from: from || null,
    result: {
      ok: false,
      status: "init",
      message: "",
      id: null,
    },
  };

  try {
    if (provider !== "resend") {
      const msg = "Alert smoke skipped: AUTH_INVITE_EMAIL_PROVIDER is not 'resend'.";
      if (requireAlertEmail) throw new Error(msg);
      evidence.result = { ok: true, status: "skipped", message: msg, id: null };
    } else if (!to || !from || !apiKey) {
      const msg = "Alert smoke skipped: ALERT_EMAIL_TO / ALERT_EMAIL_FROM(or AUTH_EMAIL_FROM) / RESEND_API_KEY is missing.";
      if (requireAlertEmail) throw new Error(msg);
      evidence.result = { ok: true, status: "skipped", message: msg, id: null };
    } else if (args.dryRun) {
      evidence.result = {
        ok: true,
        status: "dry-run",
        message: "Dry run only. No alert email was sent.",
        id: null,
      };
    } else {
      const started = Date.now();
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      evidence.result = {
        ok: !!res.ok,
        status: res.ok ? "sent" : `failed_${res.status}`,
        message: String(payload?.message || (res.ok ? "sent" : `Resend returned ${res.status}`)),
        id: payload?.id ? String(payload.id) : null,
      };
      evidence.durationMs = Date.now() - started;
      if (!res.ok) throw new Error(evidence.result.message || `Resend returned ${res.status}.`);
    }
  } catch (error) {
    evidence.result = {
      ok: false,
      status: "failed",
      message: String(error?.message || error || "alert smoke failed"),
      id: null,
    };
  }

  const relDir = path.join("docs", "evidence", "ops-alert-smoke");
  const absDir = path.join(process.cwd(), relDir);
  ensureDir(absDir);
  const relPath = path.join(relDir, `${toStamp(now)}.json`).replace(/\\/g, "/");
  fs.writeFileSync(path.join(process.cwd(), relPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  if (!evidence.result.ok) {
    console.error(`ops alert smoke failed: ${evidence.result.message}`);
    console.error(`evidence: ${relPath}`);
    process.exit(1);
  }
  console.log(`ops alert smoke passed: ${relPath}`);
}

main().catch((error) => {
  console.error(`ops alert smoke crashed: ${String(error?.message || error)}`);
  process.exit(1);
});
