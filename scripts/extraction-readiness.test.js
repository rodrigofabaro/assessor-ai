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

  const coverReadyShortText = evaluateExtractionReadiness({
    submissionStatus: "EXTRACTED",
    extractedText: "short text",
    latestRun: {
      status: "DONE",
      overallConfidence: 0.9,
      pageCount: 2,
      warnings: [],
      sourceMeta: {
        coverMetadata: {
          studentName: { value: "Jane Doe", confidence: 0.8, page: 1, snippet: "Student Name: Jane Doe" },
          unitCode: { value: "4003", confidence: 0.9, page: 1, snippet: "Unit: 4003" },
          assignmentCode: { value: "A1", confidence: 0.86, page: 1, snippet: "Assignment: A1" },
          confidence: 0.85,
        },
      },
    },
  });
  assert(coverReadyShortText.ok, "expected cover-ready short text to pass gate");
  assert(
    coverReadyShortText.warnings.some((w) => /cover metadata/i.test(w)),
    "expected warning indicating cover-ready short-text mode"
  );
  assert(coverReadyShortText.metrics.coverMetadataReady === true, "expected coverMetadataReady metric true");
  assert(
    String(coverReadyShortText.metrics.extractionMode || "UNKNOWN") === "UNKNOWN",
    "expected extraction mode metric to default to UNKNOWN when not provided"
  );

  const coverOnlyWithoutCoverReady = evaluateExtractionReadiness({
    submissionStatus: "EXTRACTED",
    extractedText: "A".repeat(1800),
    latestRun: {
      status: "DONE",
      overallConfidence: 0.92,
      pageCount: 2,
      warnings: [],
      sourceMeta: {
        extractionMode: "COVER_ONLY",
        coverMetadata: { confidence: 0.3 },
      },
    },
  });
  assert(!coverOnlyWithoutCoverReady.ok, "expected cover-only without ready cover metadata to fail gate");
  assert(
    coverOnlyWithoutCoverReady.blockers.some((b) => /cover-only extraction requires ready cover metadata/i.test(b)),
    "expected explicit cover-only readiness blocker"
  );
  assert(
    String(coverOnlyWithoutCoverReady.metrics.extractionMode || "") === "COVER_ONLY",
    "expected extraction mode metric to preserve COVER_ONLY"
  );

  console.log("extraction readiness gate tests passed.");
}

run();
