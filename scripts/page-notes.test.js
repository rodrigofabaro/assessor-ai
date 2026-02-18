#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const cache = new Map();

function resolveTsLike(basePath) {
  const candidates = [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    basePath,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
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
  const { buildPageNotesFromCriterionChecks } = loadTsModule("lib/grading/pageNotes.ts");
  const rows = [
    {
      code: "P1",
      decision: "NOT_ACHIEVED",
      rationale: "",
      evidence: [{ page: 2 }, { page: 3 }],
    },
    {
      code: "M1",
      decision: "UNCLEAR",
      rationale: "",
      evidence: [{ page: 2 }],
    },
    {
      code: "D1",
      decision: "ACHIEVED",
      rationale: "",
      evidence: [{ page: 4 }],
    },
  ];

  const supportive = buildPageNotesFromCriterionChecks(rows, {
    tone: "supportive",
    maxPages: 1,
    maxLinesPerPage: 1,
    includeCriterionCode: true,
  });
  assert(supportive.length === 1, "maxPages should limit output");
  assert(supportive[0].lines.length === 1, "maxLinesPerPage should limit output");
  assert(supportive[0].lines[0].includes("P1"), "should include criterion code when flag enabled");

  const strictNoCode = buildPageNotesFromCriterionChecks(rows, {
    tone: "strict",
    maxPages: 10,
    maxLinesPerPage: 5,
    includeCriterionCode: false,
  });
  const firstLine = strictNoCode[0]?.lines?.[0] || "";
  assert(!/\bP1\b/.test(firstLine), "should remove criterion code when flag disabled");
  assert(
    strictNoCode.some((p) => p.lines.some((l) => l.toLowerCase().includes("insufficient evidence"))),
    "strict tone should use stricter wording"
  );

  console.log("page notes tests passed.");
}

run();
