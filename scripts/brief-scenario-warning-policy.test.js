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
  const { validateBriefExtractionHard } = loadTsModule("lib/extraction/brief/hardValidation.ts");
  const { sanitizeBriefDraftArtifacts } = loadTsModule("lib/extraction/brief/draftIntegrity.ts");

  const noCueDraft = {
    kind: "BRIEF",
    scenarios: [{ appliesToTask: 1, text: "Task 1 scenario context." }],
    tasks: [
      { n: 1, text: "Use the scenario context to complete the task.", scenarioText: "Task 1 scenario context.", parts: [] },
      { n: 2, text: "Explain routine maintenance checks for this system.", scenarioText: "", parts: [] },
      { n: 3, text: "Provide one improvement recommendation.", scenarioText: "", parts: [] },
    ],
  };
  const noCueResult = validateBriefExtractionHard(noCueDraft, "Task 1\nTask 2\nTask 3");
  const noCueMissingScenario = (noCueResult.issues || []).filter((i) => i.code === "MISSING_SCENARIO");
  assert(noCueMissingScenario.length === 0, "Did not expect missing-scenario issues for tasks without scenario/context cues.");
  const noCueSanitized = sanitizeBriefDraftArtifacts(noCueDraft);
  const noCueWarnings = Array.isArray(noCueSanitized?.warnings) ? noCueSanitized.warnings.map((w) => String(w)) : [];
  assert(
    !noCueWarnings.some((w) => /missing scenario mapping for Task 2/i.test(w) || /missing scenario mapping for Task 3/i.test(w)),
    "Did not expect draft-integrity missing-scenario warnings for tasks without cues."
  );

  const cueDraft = {
    kind: "BRIEF",
    scenarios: [],
    tasks: [
      { n: 1, text: "Based on the scenario, analyse the failure and propose actions.", scenarioText: "", parts: [] },
      { n: 2, text: "Summarise your answer.", scenarioText: "", parts: [] },
    ],
  };
  const cueResult = validateBriefExtractionHard(cueDraft, "Task 1\nTask 2");
  assert(
    (cueResult.issues || []).some((i) => i.code === "MISSING_SCENARIO" && Number(i.taskNumber) === 1),
    "Expected missing-scenario issue when task explicitly requires scenario/context."
  );

  console.log("brief scenario warning policy tests passed.");
}

run();
