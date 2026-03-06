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

function hasIssue(result, code) {
  return (result.issues || []).some((i) => String(i.code || "") === code);
}

function run() {
  const { validateBriefExtractionHard } = loadTsModule("lib/extraction/brief/hardValidation.ts");

  const good = {
    kind: "BRIEF",
    tasks: [
      {
        n: 1,
        text: "Task body with enough words to satisfy the minimum threshold and remain structurally valid for extraction confidence in this test run.",
        scenarioText: "Scenario text for task one.",
        parts: [{ key: "1", text: "Part text with reasonable length and meaning." }],
      },
      {
        n: 2,
        text: "Task body two includes Figure 1 reference and token below.\n[[IMG:p4-t2-img1]]",
        scenarioText: "Scenario text for task two.",
        parts: [{ key: "b.ii", text: "Consider Figure 1 below.\n[[IMG:p4-t2-img1]]" }],
      },
    ],
  };
  const okResult = validateBriefExtractionHard(good, "Task 1\nTask 2");
  assert(okResult.ok, "Expected hard validation to pass for valid brief.");
  assert(okResult.blockerCount === 0, "Expected zero blockers for valid brief.");

  const bad = {
    kind: "BRIEF",
    tasks: [
      {
        n: 1,
        text: "Based on the scenario, write a short response.",
        scenarioText: "",
        warnings: ["task body: empty"],
        parts: [{ key: "i", text: "Part one" }, { key: "i", text: "Duplicate key" }],
      },
      {
        n: 2,
        text: "Figure 1 is shown below without token.",
        scenarioText: "Scenario two.",
        parts: [{ key: "a", text: "100 ° CC boiler condition." }],
      },
    ],
  };
  const badResult = validateBriefExtractionHard(bad, "Task 1\nTask 2\nTask 3");
  assert(!badResult.ok, "Expected hard validation to fail for invalid brief.");
  assert(hasIssue(badResult, "TASK_WARNING_SHORT_OR_EMPTY"), "Expected empty/short warning blocker.");
  assert(hasIssue(badResult, "MISSING_SCENARIO"), "Expected missing scenario blocker.");
  assert(hasIssue(badResult, "DUPLICATE_PART_KEY"), "Expected duplicate part key blocker.");
  assert(hasIssue(badResult, "FIGURE_WITHOUT_IMAGE_TOKEN"), "Expected figure token blocker.");
  assert(hasIssue(badResult, "CELSIUS_ARTIFACT"), "Expected Celsius artifact blocker.");
  assert(hasIssue(badResult, "TASK_COUNT_LOWER_THAN_SOURCE"), "Expected source task-count blocker.");

  console.log("brief hard validation tests passed.");
}

run();
