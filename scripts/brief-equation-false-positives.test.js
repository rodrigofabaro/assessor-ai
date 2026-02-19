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

function warningList(task) {
  return Array.isArray(task?.warnings) ? task.warnings.map((w) => String(w)) : [];
}

function run() {
  const { extractBrief } = loadTsModule("lib/extractors/brief.ts");

  const weakEquation = {
    id: "p2-eq1",
    pageNumber: 2,
    bbox: { x: 100, y: 120, w: 180, h: 20 },
    latex: null,
    confidence: 0.35,
    needsReview: true,
    latexSource: null,
  };

  const nonMathText = [
    "Assignment 1 of 1",
    "Task 1",
    "Project Report:",
    "Discuss planning and delivery stages and reflect on outcomes.",
    "Appendix logbook evidence should be included.",
    "[[EQ:p2-eq1]]",
  ].join("\n");
  const nonMathBrief = extractBrief(nonMathText, "u4004-a1.pdf", { equations: [weakEquation] });
  const nonMathTask = (nonMathBrief.tasks || []).find((t) => Number(t.n) === 1);
  assert(nonMathTask, "expected non-math Task 1 to be extracted");
  const nonMathJoined = [
    String(nonMathTask.text || ""),
    String(nonMathTask.prompt || ""),
    ...((nonMathTask.parts || []).map((p) => String(p?.text || ""))),
  ].join("\n");
  assert(!/\[\[EQ:p2-eq1\]\]/.test(nonMathJoined), "expected weak equation token to be stripped for non-math task");
  assert(
    !warningList(nonMathTask).some((w) => /equation quality: low-confidence/i.test(w)),
    "expected no low-confidence equation warning for non-math task"
  );
  assert(
    !warningList(nonMathTask).some((w) => /equation token unresolved/i.test(w)),
    "expected no unresolved equation warning for non-math task"
  );

  const mathText = [
    "Assignment 1 of 1",
    "Task 1",
    "Calculate the circuit current using Ohm's law.",
    "Given v = 24 and r = 6, determine i.",
    "[[EQ:p2-eq1]]",
  ].join("\n");
  const mathBrief = extractBrief(mathText, "u4004-a1-math.pdf", { equations: [weakEquation] });
  const mathTask = (mathBrief.tasks || []).find((t) => Number(t.n) === 1);
  assert(mathTask, "expected math Task 1 to be extracted");
  assert(
    warningList(mathTask).some((w) => /equation quality: low-confidence/i.test(w)),
    "expected low-confidence equation warning to remain for math task"
  );

  console.log("brief equation false-positive tests passed.");
}

run();
