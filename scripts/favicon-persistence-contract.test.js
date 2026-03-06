#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const assert = require("node:assert");

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function expectContains(haystack, needle, label) {
  assert(haystack.includes(needle), `${label} missing expected fragment: ${needle}`);
}

function expectNotContains(haystack, needle, label) {
  assert(!haystack.includes(needle), `${label} should not contain fragment: ${needle}`);
}

function main() {
  const schema = read("prisma/schema.prisma");
  const adminFaviconRoute = read("app/api/admin/favicon/route.ts");
  const runtimeFaviconRoute = read("app/api/favicon/route.ts");
  const layout = read("app/layout.tsx");
  const persistenceDoc = read("docs/operations/persistence-classification.md");

  expectContains(schema, "faviconStoragePath String?", "schema");
  expectContains(schema, "faviconMimeType   String?", "schema");

  expectContains(adminFaviconRoute, "writeStorageFile", "admin favicon route");
  expectContains(adminFaviconRoute, "faviconStoragePath", "admin favicon route");
  expectContains(adminFaviconRoute, "faviconMimeType", "admin favicon route");
  expectNotContains(adminFaviconRoute, "public\", \"favicon.ico", "admin favicon route");

  expectContains(runtimeFaviconRoute, "readStorageFile", "runtime favicon route");
  expectContains(runtimeFaviconRoute, "faviconStoragePath", "runtime favicon route");
  expectContains(runtimeFaviconRoute, "X-Favicon-Source", "runtime favicon route");

  expectContains(layout, "icon: \"/api/favicon\"", "app layout metadata");
  expectContains(layout, "shortcut: \"/api/favicon\"", "app layout metadata");

  expectContains(persistenceDoc, "Runtime favicon write", "persistence doc");
  expectContains(persistenceDoc, "Status: `migrated` (storage provider + DB pointer)", "persistence doc");

  console.log("favicon persistence contract tests passed.");
}

main();
