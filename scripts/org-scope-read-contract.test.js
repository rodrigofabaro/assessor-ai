#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cache = new Map();

function resolveTsLike(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function loadTsModule(filePath) {
  const absPath = path.resolve(filePath);
  if (cache.has(absPath)) return cache.get(absPath);

  const source = fs.readFileSync(absPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: absPath,
  }).outputText;

  const mod = { exports: {} };
  const dirname = path.dirname(absPath);
  const localRequire = (request) => {
    if (request.startsWith(".")) {
      const resolved = resolveTsLike(path.resolve(dirname, request));
      if (resolved) return loadTsModule(resolved);
    }
    if (request.startsWith("@/")) {
      const resolved = resolveTsLike(path.resolve(process.cwd(), request.slice(2)));
      if (resolved) return loadTsModule(resolved);
    }
    return require(request);
  };

  const wrapped = new Function("require", "module", "exports", compiled);
  wrapped(localRequire, mod, mod.exports);
  cache.set(absPath, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasNullFallback(scope) {
  const json = JSON.stringify(scope);
  return json.includes('"organizationId":null');
}

function main() {
  const originalStrict = process.env.AUTH_ORG_SCOPE_STRICT_READS;
  const originalLegacyStrict = process.env.ORG_SCOPE_STRICT_READS;
  delete process.env.AUTH_ORG_SCOPE_STRICT_READS;
  delete process.env.ORG_SCOPE_STRICT_READS;

  const { addOrganizationReadScope, isOrganizationScopeStrictReadsEnabled } = loadTsModule("lib/auth/requestSession.ts");
  const baseWhere = { status: "LOCKED" };

  const compatScope = addOrganizationReadScope(baseWhere, "org_123");
  assert(isOrganizationScopeStrictReadsEnabled() === false, "expected strict reads disabled by default");
  assert(hasNullFallback(compatScope), "expected compatibility scope to include organizationId null fallback");

  process.env.AUTH_ORG_SCOPE_STRICT_READS = "true";
  const strictScope = addOrganizationReadScope(baseWhere, "org_123");
  assert(isOrganizationScopeStrictReadsEnabled() === true, "expected strict reads enabled with AUTH_ORG_SCOPE_STRICT_READS=true");
  assert(!hasNullFallback(strictScope), "expected strict scope to remove organizationId null fallback");
  assert(JSON.stringify(strictScope).includes('"organizationId":"org_123"'), "expected strict scope to keep active organization filter");

  delete process.env.AUTH_ORG_SCOPE_STRICT_READS;
  process.env.ORG_SCOPE_STRICT_READS = "true";
  const legacyStrictScope = addOrganizationReadScope(baseWhere, "org_123");
  assert(isOrganizationScopeStrictReadsEnabled() === true, "expected strict reads enabled with ORG_SCOPE_STRICT_READS=true");
  assert(!hasNullFallback(legacyStrictScope), "expected legacy strict flag to remove null fallback");

  const unscoped = addOrganizationReadScope(baseWhere, null);
  assert(unscoped === baseWhere, "expected null organization id to keep original where object");

  if (originalStrict === undefined) delete process.env.AUTH_ORG_SCOPE_STRICT_READS;
  else process.env.AUTH_ORG_SCOPE_STRICT_READS = originalStrict;
  if (originalLegacyStrict === undefined) delete process.env.ORG_SCOPE_STRICT_READS;
  else process.env.ORG_SCOPE_STRICT_READS = originalLegacyStrict;

  console.log("organization scope read contract tests passed.");
}

main();
