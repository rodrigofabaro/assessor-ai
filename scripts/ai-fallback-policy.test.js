#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
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
  const { defaultEquationFallbackPolicy, pickEquationFallbackCandidates } = loadTsModule(
    "lib/extraction/brief/aiFallback.ts"
  );

  const policyOff = defaultEquationFallbackPolicy(false);
  const none = pickEquationFallbackCandidates(
    [{ id: "e1", latex: null, confidence: 0.1, needsReview: true }],
    policyOff
  );
  assert(none.size === 0, "policy disabled should return no candidates");

  const policyOn = defaultEquationFallbackPolicy(true);
  const ids = pickEquationFallbackCandidates(
    [
      { id: "e1", latex: null, confidence: 0.2, needsReview: true }, // must pick
      { id: "e2", latex: "i=", confidence: 0.9, needsReview: true }, // suspicious + review
      { id: "e3", latex: "y=4x^2-6x", confidence: 0.99, needsReview: false }, // skip
      { id: "e4", latex: null, confidence: 0.3, needsReview: true }, // must pick
      { id: "e5", latex: null, confidence: 0.4, needsReview: true }, // may be trimmed by cap
      { id: "e6", latex: null, confidence: 0.5, needsReview: true }, // may be trimmed by cap
    ],
    policyOn
  );

  assert(ids.has("e1"), "should include null/review candidate e1");
  assert(ids.has("e4"), "should include null/review candidate e4");
  assert(!ids.has("e3"), "should skip high-confidence reviewed equation");
  assert(ids.size <= policyOn.maxCandidates, "should obey maxCandidates cap");

  console.log("ai fallback policy tests passed.");
}

run();

