#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const cache = new Map();

function resolveTsLike(basePath) {
  const candidates = [`${basePath}.ts`, `${basePath}.tsx`, basePath];
  return candidates.find((p) => fs.existsSync(p)) || null;
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

function run() {
  const { buildMarkedPdfUrl } = loadTsModule("lib/submissions/markedPdfUrl.ts");
  const a = buildMarkedPdfUrl("sub-1", "ass-9", 123);
  assert(a.includes("/api/submissions/sub-1/marked-file?"), "should include marked-file route");
  assert(a.includes("assessmentId=ass-9"), "should include selected assessmentId");
  assert(a.includes("t=123"), "should include deterministic timestamp");

  const b = buildMarkedPdfUrl("sub-2", "", 456);
  assert(!b.includes("assessmentId="), "should omit assessmentId when not provided");
  assert(b.includes("t=456"), "should include timestamp even without assessmentId");

  console.log("marked pdf url tests passed.");
}

run();
