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
      code: "P6",
      decision: "NOT_ACHIEVED",
      rationale: "Method shown but branch selection is not explicit.",
      evidence: [{ page: 2, quote: "sinusoidal rearrangement and final expression shown" }, { page: 3 }],
    },
    {
      code: "P7",
      decision: "UNCLEAR",
      rationale: "Signed value shown when magnitudes requested.",
      evidence: [{ page: 2, quote: "vector components resolved using cos and sin" }],
    },
    {
      code: "D2",
      decision: "NOT_ACHIEVED",
      rationale: "Screenshots are present but confirmation wording is missing.",
      evidence: [{ page: 4, quote: "software screenshot provided" }],
    },
  ];

  const supportive = buildPageNotesFromCriterionChecks(rows, {
    tone: "supportive",
    maxPages: 2,
    maxLinesPerPage: 10,
    includeCriterionCode: true,
    handwritingLikely: true,
  });
  assert(supportive.length === 2, "maxPages should limit output");
  const note = supportive[0]?.lines || [];
  assert(note.length >= 6, "note should include strength, gap, actions and band-impact lines");
  assert(note.some((line) => /^Strength:/i.test(line)), "note should include Strength line");
  assert(note.some((line) => /^Gap:/i.test(line)), "note should include Gap line");
  assert(note.filter((line) => /^-\s/.test(line)).length >= 2, "note should include at least two action bullets");
  assert(
    note.some((line) => /This supports:\s*[PMD]\d{1,2}\.?/i.test(line) || /D2 is not fully evidenced yet/i.test(line)),
    "note should include band-impact line"
  );
  assert(
    note.some((line) => /word-processed document/i.test(line)),
    "handwriting hint should appear when handwritingLikely is true"
  );

  const strictNoCode = buildPageNotesFromCriterionChecks(rows, {
    tone: "strict",
    maxPages: 10,
    maxLinesPerPage: 10,
    includeCriterionCode: false,
  });
  const firstBlock = strictNoCode[0]?.lines || [];
  assert(!firstBlock.some((line) => /^Criterion:/i.test(line)), "should remove criterion header when flag disabled");
  assert(
    strictNoCode.some((p) => p.lines.some((l) => /Strength:|Gap:/i.test(l))),
    "structured lines should be present in strict tone"
  );

  console.log("page notes tests passed.");
}

run();
