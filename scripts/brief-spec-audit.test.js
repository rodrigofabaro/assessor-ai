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

function hasFinding(audit, code, contains = "") {
  return (audit.findings || []).some((f) => {
    if (String(f?.code || "") !== code) return false;
    if (!contains) return true;
    return String(f?.message || "").toLowerCase().includes(String(contains).toLowerCase());
  });
}

function run() {
  const { evaluateBriefSpecAudit } = loadTsModule("lib/briefs/briefSpecAudit.ts");

  const unitCriteria = [
    { acCode: "P1", gradeBand: "PASS", loCode: "LO1", description: "d1" },
    { acCode: "P2", gradeBand: "PASS", loCode: "LO1", description: "d2" },
    { acCode: "P3", gradeBand: "PASS", loCode: "LO2", description: "d3" },
    { acCode: "P4", gradeBand: "PASS", loCode: "LO2", description: "d4" },
    { acCode: "P5", gradeBand: "PASS", loCode: "LO3", description: "d5" },
    { acCode: "P6", gradeBand: "PASS", loCode: "LO4", description: "d6" },
  ];

  const selectedOnlyLo12 = evaluateBriefSpecAudit({
    briefDraft: { loHeaders: ["LO1: x", "LO2: y"] },
    selectedUnitCode: "45",
    selectedUnitTitle: "Systems",
    unitCriteria,
    selectedCodes: ["P1", "P2", "P3", "P4"],
  });
  assert(
    !hasFinding(selectedOnlyLo12, "LO_MISSING_IN_BRIEF", "LO3"),
    "LO3 should not be flagged missing when selected criteria only span LO1/LO2."
  );
  assert(
    !hasFinding(selectedOnlyLo12, "LO_MISSING_IN_BRIEF", "LO4"),
    "LO4 should not be flagged missing when selected criteria only span LO1/LO2."
  );

  const criteriaBlock = [
    "Relevant Learning Outcomes and Assessment Criteria",
    "LO1 Describe x D1 Critically examine x",
    "P1 Describe x",
    "M1 Analyse x",
    "P2 Review x",
    "LO2 Identify y",
    "P3 Identify y",
    "M2 Predict y",
    "P4 Justify y",
  ].join("\n");

  const p2Audit = evaluateBriefSpecAudit({
    briefDraft: { endMatter: { criteriaBlock }, loHeaders: ["LO1: x", "LO2: y"], unitCodeGuess: "45" },
    selectedUnitCode: "45",
    selectedUnitTitle: "Systems",
    unitCriteria,
    selectedCodes: ["P2"],
  });
  assert(
    !hasFinding(p2Audit, "LO_AC_MAPPING_MISMATCH"),
    "P2 should remain mapped to LO1 and must not be flagged as LO mismatch."
  );

  console.log("brief spec audit tests passed.");
}

run();
