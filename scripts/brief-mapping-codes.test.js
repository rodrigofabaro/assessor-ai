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
  const { selectBriefMappingCodes } = loadTsModule("lib/briefs/mappingCodes.ts");

  const unitCriteria = [
    { acCode: "P1", gradeBand: "PASS", loCode: "LO1" },
    { acCode: "P2", gradeBand: "PASS", loCode: "LO1" },
    { acCode: "M1", gradeBand: "MERIT", loCode: "LO1" },
    { acCode: "D1", gradeBand: "DISTINCTION", loCode: "LO1" },
    { acCode: "P3", gradeBand: "PASS", loCode: "LO2" },
    { acCode: "P4", gradeBand: "PASS", loCode: "LO2" },
    { acCode: "M2", gradeBand: "MERIT", loCode: "LO2" },
    { acCode: "D2", gradeBand: "DISTINCTION", loCode: "LO2" },
  ];

  const a1 = selectBriefMappingCodes(
    {
      criteriaCodes: ["P1", "P2", "P4", "M1"],
      rawText: "Relevant criteria LO1 P1 P2 M1 and an equation marker [[EQ:p4-eq1]].",
    },
    unitCriteria
  );
  assert(!a1.baseCodes.includes("P4"), "expected token artifact P4 to be removed from base codes");
  assert(a1.selectedCodes.includes("D1"), "expected D1 to be inferred for LO1 when M1 exists");
  assert(!a1.selectedCodes.includes("P4"), "expected P4 to stay excluded for A1");

  const a2 = selectBriefMappingCodes(
    {
      criteriaCodes: ["P3", "P4", "M2", "D1"],
      rawText: "Relevant criteria LO2 P3 P4 M2 D1",
    },
    unitCriteria
  );
  assert(a2.selectedCodes.includes("D2"), "expected D2 to be inferred for LO2 when M2 exists");
  assert(!a2.selectedCodes.includes("D1"), "expected cross-LO distinction D1 to be removed for LO2 mapping");

  console.log("brief mapping code regression tests passed.");
}

run();

