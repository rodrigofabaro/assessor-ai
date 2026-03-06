#!/usr/bin/env node

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function info(message) {
  console.log(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const provider = String(process.env.AUTH_INVITE_EMAIL_PROVIDER || process.env.AUTH_EMAIL_PROVIDER || "none")
    .trim()
    .toLowerCase();
  const requireWebhook = isTruthy(process.env.AUTH_REQUIRE_EMAIL_WEBHOOK);
  const webhookSecret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
  const allowUnsigned = isTruthy(process.env.RESEND_WEBHOOK_ALLOW_UNSIGNED);

  if (provider !== "resend") {
    info("email webhook contract skipped: AUTH_INVITE_EMAIL_PROVIDER is not 'resend'.");
    process.exit(0);
  }

  if (!webhookSecret) {
    if (requireWebhook) {
      fail(
        "email webhook contract failed: AUTH_REQUIRE_EMAIL_WEBHOOK=true requires RESEND_WEBHOOK_SECRET."
      );
    }
    info("email webhook contract warning: RESEND_WEBHOOK_SECRET is not set (lifecycle webhook ingestion inactive).");
    process.exit(0);
  }

  if (allowUnsigned) {
    if (requireWebhook) {
      fail(
        "email webhook contract failed: RESEND_WEBHOOK_ALLOW_UNSIGNED must be false when AUTH_REQUIRE_EMAIL_WEBHOOK=true."
      );
    }
    info("email webhook contract warning: RESEND_WEBHOOK_ALLOW_UNSIGNED=true (use only for local testing).");
    process.exit(0);
  }

  info("email webhook contract passed: signed Resend webhook configuration present.");
}

main();

