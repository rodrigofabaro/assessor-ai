#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function expectContains(haystack, needle, label) {
  assert(haystack.includes(needle), `${label} missing expected fragment: ${needle}`);
}

function main() {
  const recoveryRoute = read("app/api/auth/password-recovery/route.ts");
  const confirmRoute = read("app/api/auth/password-recovery/confirm/route.ts");
  const resetPage = read("app/auth/reset/page.tsx");
  const loginForm = read("app/login/LoginForm.tsx");
  const inviteEmail = read("lib/auth/inviteEmail.ts");
  const tokenLib = read("lib/auth/passwordRecoveryToken.ts");
  const middleware = read("middleware.ts");
  const releaseGate = read("scripts/release-gate-evidence.js");
  const packageJson = read("package.json");
  const envExample = read(".env.example");

  expectContains(recoveryRoute, "AUTH_PASSWORD_RECOVERY_UNAVAILABLE", "password-recovery route");
  expectContains(recoveryRoute, "sendPasswordRecoveryEmail", "password-recovery route");
  expectContains(recoveryRoute, "buildPasswordRecoveryUrl", "password-recovery route");
  expectContains(recoveryRoute, "passwordResetToken.create", "password-recovery route");
  expectContains(confirmRoute, "AUTH_PASSWORD_RECOVERY_INVALID_OR_EXPIRED", "password-recovery confirm route");
  expectContains(confirmRoute, "passwordResetToken.updateMany", "password-recovery confirm route");
  expectContains(resetPage, "ResetPasswordForm", "password reset page");

  expectContains(loginForm, "/api/auth/password-recovery", "login form");
  expectContains(loginForm, "Forgot password?", "login form");

  expectContains(inviteEmail, "sendPasswordRecoveryEmail", "inviteEmail");
  expectContains(inviteEmail, "resetUrl", "inviteEmail");
  expectContains(tokenLib, "hashPasswordRecoveryToken", "password recovery token helper");
  expectContains(middleware, "/api/auth/password-recovery", "middleware");
  expectContains(middleware, "/api/auth/password-recovery/confirm", "middleware");
  expectContains(middleware, "/auth/reset", "middleware");

  expectContains(releaseGate, "password_recovery_email_contract", "release gate");
  expectContains(packageJson, "ops:password-recovery-contract", "package.json");
  expectContains(envExample, "AUTH_REQUIRE_RECOVERY_EMAIL=", ".env.example");
  expectContains(envExample, "RESET_TOKEN_PEPPER=", ".env.example");
  expectContains(envExample, "AUTH_APP_ORIGIN=", ".env.example");

  console.log("password recovery contract tests passed.");
}

main();
