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
  const { enforceFeedbackVascrPolicy } = loadTsModule("lib/grading/feedbackVascrPolicy.ts");

  const inputLong =
    "You have done well. You have done well. The report is clear. The report is clear. Add deeper evaluation in Task 3. Add deeper evaluation in Task 3.";
  const resultLong = enforceFeedbackVascrPolicy({
    summary: inputLong,
    overallGrade: "PASS",
    criterionChecks: [{ code: "P1", decision: "ACHIEVED" }, { code: "M1", decision: "NOT_ACHIEVED" }],
    maxSentences: 4,
  });
  assert(resultLong.changed, "expected policy to adjust duplicated/verbose summary");
  assert(
    /mapped evidence|criteria/i.test(resultLong.summary),
    "expected summary to include evidence/criteria signal"
  );
  assert(
    /To improve the outcome|to progress|to reach|address remaining criteria/i.test(resultLong.summary),
    "expected summary to include feed-forward action when criteria are open"
  );

  const cleanInput =
    "Your submission is linked to evidence and criteria outcomes. To progress, strengthen the final evaluation with clearer page-linked justification.";
  const cleanResult = enforceFeedbackVascrPolicy({
    summary: cleanInput,
    overallGrade: "MERIT",
    criterionChecks: [{ code: "P1", decision: "ACHIEVED" }, { code: "M1", decision: "NOT_ACHIEVED" }],
  });
  assert(cleanResult.summary.length > 10, "expected clean summary to remain non-empty");

  console.log("feedback VASCR policy tests passed.");
}

run();

