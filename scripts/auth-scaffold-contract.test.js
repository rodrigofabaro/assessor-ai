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
  const rbac = read("lib/auth/rbac.ts");
  const middleware = read("middleware.ts");
  const session = read("lib/auth/session.ts");
  const bootstrap = read("app/api/auth/session/bootstrap/route.ts");
  const envExample = read(".env.example");

  // RBAC matrix contract
  expectContains(rbac, 'prefix: "/admin"', "rbac");
  expectContains(rbac, 'prefix: "/api/admin"', "rbac");
  expectContains(rbac, 'prefix: "/submissions"', "rbac");
  expectContains(rbac, 'prefix: "/api/submissions"', "rbac");
  expectContains(rbac, 'prefix: "/students"', "rbac");
  expectContains(rbac, 'prefix: "/api/students"', "rbac");
  expectContains(rbac, 'allowedRoles: ["ADMIN"]', "rbac");
  expectContains(rbac, 'allowedRoles: ["ADMIN", "ASSESSOR", "IV"]', "rbac");

  // Middleware session-first resolution contract
  expectContains(middleware, "SESSION_COOKIE_NAME", "middleware");
  expectContains(middleware, "verifySignedSessionTokenEdge", "middleware");
  expectContains(middleware, "AUTH_REQUIRED", "middleware");
  expectContains(middleware, "ROLE_FORBIDDEN", "middleware");

  // Session helper contract
  expectContains(session, 'const SESSION_COOKIE_NAME = "assessor_session"', "session");
  expectContains(session, "AUTH_SESSION_SECRET", "session");
  expectContains(session, "createSignedSessionToken", "session");
  expectContains(session, "verifySignedSessionToken", "session");

  // Session bootstrap route contract
  expectContains(bootstrap, "AUTH_SESSION_SECRET_MISSING", "bootstrap");
  expectContains(bootstrap, "getSessionCookieName()", "bootstrap");
  expectContains(bootstrap, "createSignedSessionToken", "bootstrap");

  // Env contract exposure
  expectContains(envExample, "AUTH_GUARDS_ENABLED=false", ".env.example");
  expectContains(envExample, "AUTH_SESSION_SECRET=", ".env.example");

  console.log("auth scaffold contract tests passed.");
}

main();
