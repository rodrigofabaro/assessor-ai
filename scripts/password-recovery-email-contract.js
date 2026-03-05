#!/usr/bin/env node

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const provider = String(process.env.AUTH_INVITE_EMAIL_PROVIDER || process.env.AUTH_EMAIL_PROVIDER || "none")
    .trim()
    .toLowerCase();
  const requireRecoveryEmail = isTruthy(process.env.AUTH_REQUIRE_RECOVERY_EMAIL);
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  const emailFrom = String(process.env.AUTH_EMAIL_FROM || "").trim();
  const resetTokenPepper = String(process.env.RESET_TOKEN_PEPPER || "").trim();
  const appOrigin = String(
    process.env.AUTH_APP_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN || process.env.APP_ORIGIN || ""
  ).trim();

  if (provider === "none") {
    if (requireRecoveryEmail) {
      fail(
        "password recovery email contract failed: AUTH_REQUIRE_RECOVERY_EMAIL=true requires AUTH_INVITE_EMAIL_PROVIDER=resend."
      );
    }
    console.log(
      "password recovery email contract warning: provider is disabled (AUTH_INVITE_EMAIL_PROVIDER=none)."
    );
    process.exit(0);
  }

  if (provider !== "resend") {
    fail(`password recovery email contract failed: unsupported provider '${provider}'.`);
  }

  if (!resendApiKey || !emailFrom) {
    fail(
      "password recovery email contract failed: RESEND_API_KEY and AUTH_EMAIL_FROM are required when AUTH_INVITE_EMAIL_PROVIDER=resend."
    );
  }
  if (!resetTokenPepper) {
    fail("password recovery email contract failed: RESET_TOKEN_PEPPER is required when AUTH_INVITE_EMAIL_PROVIDER=resend.");
  }
  if (!appOrigin) {
    fail(
      "password recovery email contract failed: AUTH_APP_ORIGIN (or NEXT_PUBLIC_APP_ORIGIN/APP_ORIGIN) is required when AUTH_INVITE_EMAIL_PROVIDER=resend."
    );
  }

  console.log("password recovery email contract passed.");
}

main();
