#!/usr/bin/env node
const os = require("node:os");
const path = require("node:path");

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function startsWithPath(target, base) {
  const t = path.normalize(target).toLowerCase();
  const b = path.normalize(base).toLowerCase();
  return t === b || t.startsWith(`${b}${path.sep}`);
}

function main() {
  const requireDurableRoot = isTruthy(process.env.ENV_CONTRACT_REQUIRE_STORAGE_ROOT);
  const rawRoot = String(process.env.FILE_STORAGE_ROOT || "").trim();
  const isVercel = isTruthy(process.env.VERCEL);

  if (!rawRoot) {
    if (requireDurableRoot) {
      fail(
        "storage deployment contract failed: ENV_CONTRACT_REQUIRE_STORAGE_ROOT=true requires FILE_STORAGE_ROOT."
      );
    }
    const mode = isVercel ? "runtime temp fallback (non-durable)" : "local filesystem fallback";
    console.log(`storage deployment contract warning: FILE_STORAGE_ROOT is not set (${mode}).`);
    process.exit(0);
  }

  const isAbsolute = path.isAbsolute(rawRoot);
  const resolved = isAbsolute ? path.normalize(rawRoot) : path.resolve(process.cwd(), rawRoot);
  const repoRoot = path.resolve(process.cwd());
  const tmpRoot = path.normalize(os.tmpdir());

  if (requireDurableRoot && !isAbsolute) {
    fail(
      "storage deployment contract failed: FILE_STORAGE_ROOT must be an absolute path when ENV_CONTRACT_REQUIRE_STORAGE_ROOT=true."
    );
  }
  if (requireDurableRoot && startsWithPath(resolved, tmpRoot)) {
    fail(
      "storage deployment contract failed: FILE_STORAGE_ROOT points to an OS temp directory, which is not durable."
    );
  }

  if (startsWithPath(resolved, repoRoot)) {
    console.log(
      "storage deployment contract warning: FILE_STORAGE_ROOT resolves inside the repo; use external durable storage for production."
    );
  }

  console.log(`storage deployment contract passed: FILE_STORAGE_ROOT=${resolved}`);
}

main();
