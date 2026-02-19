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
  const {
    validateGradingScopeChangeRequest,
    applyGradingScopeChangeMeta,
    normalizeCriterionCode,
  } = loadTsModule("lib/briefs/gradingScopeChange.ts");

  assert(normalizeCriterionCode("m 03") === "M3", "expected criterion code normalization");

  const missingReason = validateGradingScopeChangeRequest(
    ["M1"],
    ["M1", "M2"],
    { criterionCode: "M2", excluded: true, reason: "x" }
  );
  assert(!missingReason.ok, "expected short reason to fail");

  const multiChange = validateGradingScopeChangeRequest(
    ["P1"],
    ["P1", "M1", "D1"],
    { criterionCode: "M1", excluded: true, reason: "valid reason" }
  );
  assert(!multiChange.ok, "expected multi-change request to fail");

  const mismatch = validateGradingScopeChangeRequest(
    ["M1"],
    [],
    { criterionCode: "M1", excluded: true, reason: "valid reason" }
  );
  assert(!mismatch.ok, "expected excluded mismatch to fail");

  const valid = validateGradingScopeChangeRequest(
    ["P1", "M1"],
    ["P1"],
    { criterionCode: "M1", excluded: false, reason: "Removed due to external evidence source" }
  );
  assert(valid.ok, "expected valid scope change to pass");
  if (!valid.ok) throw new Error("validation unexpectedly failed");

  const patchedMeta = applyGradingScopeChangeMeta({
    previousMeta: {
      gradingCriteriaExclusionReasons: {
        M1: { reason: "legacy reason", at: "2026-02-01T00:00:00.000Z" },
      },
      gradingCriteriaExclusionLog: [
        { criterionCode: "M1", excluded: true, reason: "legacy reason", at: "2026-02-01T00:00:00.000Z" },
      ],
    },
    change: {
      criterionCode: "M1",
      excluded: false,
      reason: "Re-enabled after verification",
    },
    actor: "QA Lead",
    atIso: "2026-02-19T12:00:00.000Z",
    gradedSubmissionCount: 3,
  });
  assert(
    !Object.prototype.hasOwnProperty.call(patchedMeta.gradingCriteriaExclusionReasons, "M1"),
    "expected reasons map to clear code when criterion is re-included"
  );
  assert(
    Array.isArray(patchedMeta.gradingCriteriaExclusionLog) &&
      patchedMeta.gradingCriteriaExclusionLog.length === 2,
    "expected change log append"
  );
  const last = patchedMeta.gradingCriteriaExclusionLog[patchedMeta.gradingCriteriaExclusionLog.length - 1];
  assert(last.actor === "QA Lead", "expected actor in appended log entry");
  assert(last.gradedSubmissionCount === 3, "expected gradedSubmissionCount in appended log entry");

  console.log("brief grading scope change tests passed.");
}

run();
