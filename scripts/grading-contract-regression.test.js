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
  const { validateGradeDecision } = loadTsModule("lib/grading/decisionValidation.ts");
  const { buildStructuredGradingV2 } = loadTsModule("lib/grading/assessmentResult.ts");

  const validated = validateGradeDecision(
    {
      overallGradeWord: "PASS",
      resubmissionRequired: false,
      feedbackSummary: "Solid submission against pass-level outcomes.",
      feedbackBullets: ["Evidence is page-linked and specific."],
      criterionChecks: [
        {
          code: "P1",
          decision: "ACHIEVED",
          rationale: "Criterion demonstrated.",
          confidence: 0.88,
          evidence: [{ page: 2, quote: "SPC method correctly applied to process dataset." }],
        },
        {
          code: "M1",
          decision: "NOT_ACHIEVED",
          rationale: "Merit-level evaluative depth absent.",
          confidence: 0.79,
          evidence: [{ page: 5, visualDescription: "Section lists outcomes but no comparative evaluation." }],
        },
      ],
      confidence: 0.83,
    },
    ["P1", "M1"]
  );

  assert(validated.ok, "expected valid grading payload");
  const result = buildStructuredGradingV2(validated.data, {
    contractVersion: "v2-structured-evidence",
    promptHash: "abc123",
    model: "gpt-x",
    gradedBy: "test-user",
    startedAtIso: "2026-02-17T00:00:00.000Z",
    completedAtIso: "2026-02-17T00:01:00.000Z",
  });

  assert(result.contractVersion === "v2-structured-evidence", "expected contract version");
  assert(result.promptHash === "abc123", "expected prompt hash");
  assert(result.model === "gpt-x", "expected model");
  assert(result.overallGradeWord === "PASS", "expected grade word");
  assert(Array.isArray(result.criterionChecks) && result.criterionChecks.length === 2, "expected criterion checks");
  assert(result.criterionChecks[0].evidence[0].page === 2, "expected page evidence preserved");
  assert(
    Object.prototype.hasOwnProperty.call(result.criterionChecks[1].evidence[0], "visualDescription"),
    "expected visualDescription evidence support"
  );

  const bad = validateGradeDecision(
    {
      overallGradeWord: "PASS",
      resubmissionRequired: false,
      feedbackSummary: "bad",
      feedbackBullets: ["bad"],
      criterionChecks: [
        { code: "P1", decision: "ACHIEVED", rationale: "bad", confidence: 0.9, evidence: [] },
      ],
      confidence: 0.8,
    },
    ["P1"]
  );
  assert(!bad.ok, "expected achieved without evidence to fail validation");

  console.log("grading contract regression tests passed.");
}

run();

