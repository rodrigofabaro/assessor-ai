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
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
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
  const { detectBriefExtractionProfile, extractBrief, BRIEF_PARSER_VERSION } = loadTsModule("lib/extractors/brief.ts");

  const page1 = [
    "Pearson BTEC Higher Nationals for England (2024)",
    "Issue 1 - 2025/26",
    "Policy on the Use of Artificial Intelligence",
    "",
    "Vocational Scenario or Context",
    "You are a new process engineer at UniCourse Automotive.",
    "",
    "Task 1",
    "Based on the scenario, produce a risk and quality evaluation.",
    "a) Outline two current quality risks in the plant.",
    "b) Evaluate two mitigation options for the board.",
    "i) Assess expected impact on throughput.",
    "ii) Assess expected impact on defect rates.",
  ].join("\n");

  const page2 = [
    "Vocational Scenario or Context",
    "A second scenario now focuses on implementation planning for a pilot shift.",
    "",
    "Task 2",
    "Using the scenario, produce an implementation plan for the pilot line.",
    "1) Define the initial data capture setup.",
    "2) Define quality checkpoints and control limits.",
    "3) Define review and escalation actions.",
  ].join("\n");

  const page3 = [
    "Sources of information to support you with this Assignment",
    "Pearson references and links.",
  ].join("\n");

  const text = [page1, page2, page3].join("\f");
  const detected = detectBriefExtractionProfile(text, "U4017 A1 - UniCourse.pdf");
  assert(detected === "UNICOURSE", "expected UniCourse profile detection for template signals");

  const brief = extractBrief(text, "U4017 A1 - UniCourse.pdf");
  assert(brief.parserVersion === BRIEF_PARSER_VERSION, "expected parserVersion metadata");
  assert(brief.extractionProfileDetected === "UNICOURSE", "expected detected profile metadata");
  assert(brief.extractionProfile === "UNICOURSE", "expected UniCourse profile to win selection");

  const candidateProfiles = (Array.isArray(brief.extractionProfileCandidates) ? brief.extractionProfileCandidates : [])
    .map((candidate) => String(candidate?.profile || ""));
  assert(candidateProfiles.includes("UNICOURSE"), "expected UniCourse candidate in profile scoring");
  assert(candidateProfiles.includes("GENERIC"), "expected generic fallback candidate in profile scoring");

  const tasks = Array.isArray(brief.tasks) ? brief.tasks : [];
  assert(tasks.length === 2, `expected 2 tasks, got ${tasks.length}`);

  const task1 = tasks.find((task) => Number(task?.n) === 1);
  assert(!!task1, "expected Task 1");
  const task1Keys = new Set((Array.isArray(task1?.parts) ? task1.parts : []).map((part) => String(part?.key || "").toLowerCase()));
  assert(task1Keys.has("b.i"), "expected nested key b.i in Task 1 parts");
  assert(task1Keys.has("b.ii"), "expected nested key b.ii in Task 1 parts");

  const task2 = tasks.find((task) => Number(task?.n) === 2);
  assert(!!task2, "expected Task 2");
  const task2Keys = new Set((Array.isArray(task2?.parts) ? task2.parts : []).map((part) => String(part?.key || "").toLowerCase()));
  assert(task2Keys.has("1") && task2Keys.has("2") && task2Keys.has("3"), "expected numeric part keys 1/2/3 in Task 2");

  const scenarioTasks = new Set(
    (Array.isArray(brief.scenarios) ? brief.scenarios : [])
      .map((scenario) => Number(scenario?.appliesToTask || 0))
      .filter((taskNumber) => Number.isInteger(taskNumber) && taskNumber > 0)
  );
  assert(scenarioTasks.has(1), "expected scenario mapping for Task 1");
  assert(scenarioTasks.has(2), "expected scenario mapping for Task 2");

  console.log("brief template profile tests passed.");
}

run();
