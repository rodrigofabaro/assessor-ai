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
  const criteria = ["P1", "M1"];

  const valid = validateGradeDecision(
    {
      overallGrade: "PASS",
      feedbackSummary: "Good structure with some evidence gaps.",
      feedbackBullets: ["Addresses LO1 clearly.", "Needs deeper evaluation for distinction criteria."],
      criterionChecks: [
        {
          code: "P1",
          met: true,
          comment: "Clear demonstration in section 2.",
          evidence: [{ page: 2, quote: "Control chart interpretation is accurate and applied." }],
        },
        {
          code: "M1",
          met: false,
          comment: "Analysis is descriptive rather than evaluative.",
          evidence: [{ page: 4, quote: "The report lists tools but does not justify selection trade-offs." }],
        },
      ],
      confidence: 0.82,
    },
    criteria
  );

  assert(valid.ok, "expected valid decision to pass");
  assert(valid.data.overallGrade === "PASS", "expected normalized PASS grade");

  const invalidMissingEvidence = validateGradeDecision(
    {
      overallGrade: "MERIT",
      feedbackSummary: "Incomplete criteria coverage.",
      feedbackBullets: ["One bullet only."],
      criterionChecks: [{ code: "P1", met: true, comment: "ok", evidence: [] }],
      confidence: 0.7,
    },
    criteria
  );

  assert(!invalidMissingEvidence.ok, "expected missing evidence/codes to fail");
  assert(
    invalidMissingEvidence.errors.some((e) => /Missing criterion check/i.test(e)),
    "expected missing criterion code error"
  );
  assert(
    invalidMissingEvidence.errors.some((e) => /evidence/i.test(e)),
    "expected evidence validation error"
  );

  const failAsRefer = validateGradeDecision(
    {
      overallGrade: "FAIL",
      feedbackSummary: "Does not meet pass threshold.",
      feedbackBullets: ["Major omissions in required tasks."],
      criterionChecks: [
        {
          code: "P1",
          met: false,
          comment: "Missing required analysis.",
          evidence: [{ page: 1, quote: "No statistical process control discussion present." }],
        },
        {
          code: "M1",
          met: false,
          comment: "No evaluative comparison provided.",
          evidence: [{ page: 1, quote: "No merit-level comparison or justification found." }],
        },
      ],
      confidence: 0.76,
    },
    criteria
  );

  assert(failAsRefer.ok, "expected FAIL to be accepted");
  assert(failAsRefer.data.overallGrade === "REFER", "expected FAIL to normalize to REFER");
  console.log("grading schema validation tests passed.");
}

run();
