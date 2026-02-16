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
  const { evaluateExtractionReadiness } = loadTsModule("lib/grading/extractionQualityGate.ts");

  const good = evaluateExtractionReadiness({
    submissionStatus: "EXTRACTED",
    extractedText: "A".repeat(1400),
    latestRun: {
      status: "DONE",
      overallConfidence: 0.84,
      pageCount: 5,
      warnings: [],
    },
  });
  assert(good.ok, "expected good extraction to pass gate");
  assert(good.blockers.length === 0, "expected no blockers for good extraction");

  const needsOcr = evaluateExtractionReadiness({
    submissionStatus: "NEEDS_OCR",
    extractedText: "A".repeat(900),
    latestRun: {
      status: "NEEDS_OCR",
      overallConfidence: 0.4,
      pageCount: 3,
      warnings: ["OCR required"],
    },
  });
  assert(!needsOcr.ok, "expected NEEDS_OCR to fail gate");
  assert(needsOcr.blockers.some((b) => /NEEDS_OCR/i.test(b)), "expected NEEDS_OCR blocker");

  const lowText = evaluateExtractionReadiness({
    submissionStatus: "EXTRACTED",
    extractedText: "short text",
    latestRun: {
      status: "DONE",
      overallConfidence: 0.9,
      pageCount: 2,
      warnings: [],
    },
  });
  assert(!lowText.ok, "expected short extraction text to fail gate");
  assert(lowText.blockers.some((b) => /too short/i.test(b)), "expected min chars blocker");

  console.log("extraction readiness gate tests passed.");
}

run();
