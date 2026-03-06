#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function parseArgs(argv) {
  const getFlagValue = (flag) => {
    const idx = argv.findIndex((a) => a === flag);
    return idx >= 0 ? String(argv[idx + 1] || "").trim() : "";
  };
  return {
    dryRun: argv.includes("--dry-run"),
    baseUrl: getFlagValue("--base-url"),
    eventType: getFlagValue("--event-type"),
    recipient: getFlagValue("--recipient"),
    messageId: getFlagValue("--message-id"),
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

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function resolveProvider() {
  const raw = String(process.env.AUTH_INVITE_EMAIL_PROVIDER || process.env.AUTH_EMAIL_PROVIDER || "none")
    .trim()
    .toLowerCase();
  if (raw === "resend") return "resend";
  return "none";
}

function decodeSvixSecret(secret) {
  const raw = String(secret || "").trim();
  const withoutPrefix = raw.startsWith("whsec_") ? raw.slice(6) : raw;
  return Buffer.from(withoutPrefix, "base64");
}

function resolveBaseUrl(override) {
  return String(
    override ||
      process.env.EMAIL_WEBHOOK_SMOKE_BASE_URL ||
      process.env.READINESS_BASE_URL ||
      process.env.DEPLOY_SMOKE_BASE_URL ||
      "http://localhost:3000"
  )
    .trim()
    .replace(/\/+$/, "");
}

function resolveEventType(input) {
  const clean = String(input || "").trim().toLowerCase();
  if (!clean) return "email.delivered";
  return clean;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const provider = resolveProvider();
  const requireWebhook = isTruthy(process.env.AUTH_REQUIRE_EMAIL_WEBHOOK);
  const allowUnsigned = isTruthy(process.env.RESEND_WEBHOOK_ALLOW_UNSIGNED);
  const webhookSecret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
  const baseUrl = resolveBaseUrl(args.baseUrl);
  const endpoint = `${baseUrl}/api/webhooks/resend`;
  const eventType = resolveEventType(args.eventType);
  const messageId = String(args.messageId || `msg_smoke_${Date.now()}`).trim();
  const recipient = String(args.recipient || "ops-smoke@assessor-ai.local").trim().toLowerCase();

  const payloadObj = {
    type: eventType,
    created_at: now.toISOString(),
    data: {
      email_id: messageId,
      to: [recipient],
      subject: "Assessor AI webhook smoke event",
    },
  };
  const body = JSON.stringify(payloadObj);

  const evidence = {
    generatedAt: now.toISOString(),
    gate: "ops-email-webhook-smoke",
    provider,
    requireWebhook,
    dryRun: args.dryRun,
    endpoint,
    eventType,
    messageId,
    recipient,
    webhookConfig: {
      configured: !!webhookSecret,
      allowUnsigned,
    },
    result: {
      ok: false,
      status: "init",
      message: "",
      responseStatus: null,
      responseBody: null,
    },
  };

  try {
    if (provider !== "resend") {
      evidence.result = {
        ok: true,
        status: "skipped",
        message: "Webhook smoke skipped: AUTH_INVITE_EMAIL_PROVIDER is not 'resend'.",
        responseStatus: null,
        responseBody: null,
      };
    } else if (!webhookSecret) {
      if (requireWebhook) {
        throw new Error(
          "Webhook smoke failed: AUTH_REQUIRE_EMAIL_WEBHOOK=true but RESEND_WEBHOOK_SECRET is not configured."
        );
      }
      evidence.result = {
        ok: true,
        status: "skipped",
        message: "Webhook smoke skipped: RESEND_WEBHOOK_SECRET is not configured.",
        responseStatus: null,
        responseBody: null,
      };
    } else if (args.dryRun) {
      evidence.result = {
        ok: true,
        status: "dry-run",
        message: "Dry run only. No webhook request was sent.",
        responseStatus: null,
        responseBody: payloadObj,
      };
    } else {
      const svixId = `msg_${Date.now()}`;
      const svixTimestamp = String(Math.floor(Date.now() / 1000));
      const signedPayload = `${svixId}.${svixTimestamp}.${body}`;
      const signature = crypto
        .createHmac("sha256", decodeSvixSecret(webhookSecret))
        .update(signedPayload)
        .digest("base64");
      const headerSignature = `v1,${signature}`;

      const started = Date.now();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": headerSignature,
        },
        body,
      });
      const responseText = await res.text();
      let responseJson = null;
      try {
        responseJson = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseJson = { raw: responseText };
      }
      evidence.durationMs = Date.now() - started;
      evidence.result = {
        ok: !!res.ok,
        status: res.ok ? "ingested" : `failed_${res.status}`,
        message: String(responseJson?.error || responseJson?.message || ""),
        responseStatus: res.status,
        responseBody: responseJson,
      };

      if (!res.ok) {
        throw new Error(`Webhook endpoint returned ${res.status}.`);
      }
    }
  } catch (error) {
    evidence.result = {
      ok: false,
      status: "failed",
      message: String(error?.message || error || "webhook smoke failed"),
      responseStatus: evidence.result.responseStatus,
      responseBody: evidence.result.responseBody,
    };
  }

  const relDir = path.join("docs", "evidence", "email-webhook-smoke");
  const absDir = path.join(process.cwd(), relDir);
  ensureDir(absDir);
  const relPath = path.join(relDir, `${toStamp(now)}.json`).replace(/\\/g, "/");
  fs.writeFileSync(path.join(process.cwd(), relPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  if (!evidence.result.ok) {
    console.error(`email webhook smoke failed: ${evidence.result.message}`);
    console.error(`evidence: ${relPath}`);
    process.exit(1);
  }

  console.log(`email webhook smoke passed: ${relPath}`);
}

main().catch((error) => {
  console.error(`email webhook smoke crashed: ${String(error?.message || error)}`);
  process.exit(1);
});

