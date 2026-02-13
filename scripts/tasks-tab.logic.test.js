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
  const { mergeOverrideTasks } = loadTsModule("app/admin/briefs/[briefId]/components/tasks/tasksTab.logic.ts");

  const extracted = [
    {
      n: 1,
      label: "Task 1",
      text: "PART 1\nv=(t^3+4)^2\nPART 2\nv=(2t^2-5t+3)^4",
      prompt: "old prompt 1",
      parts: [{ key: "a", text: "stale a" }],
    },
    {
      n: 2,
      label: "Task 2",
      text: "PART 1\ni=E/R e^{-t/RC}",
      prompt: "old prompt 2",
      parts: [{ key: "a", text: "stale b" }],
    },
  ];

  const overrides = [
    // Intentionally first index but for task 2 only.
    { n: 2, text: "PART 1\ni = \\frac{E}{R}e^{-t/RC}" },
  ];

  const rows = mergeOverrideTasks(extracted, overrides);
  assert(Array.isArray(rows) && rows.length === 2, "expected two task rows");

  // Task 1 must not receive task 2 override (guards against index fallback regressions).
  assert(rows[0].task.n === 1, "row 0 should be task 1");
  assert(rows[0].overrideApplied === false, "task 1 must not be marked overridden");
  assert(rows[0].task.text.includes("v=(t^3+4)^2"), "task 1 text changed unexpectedly");
  assert(rows[0].task.prompt === rows[0].task.text, "task 1 prompt should sync from text");
  assert(Array.isArray(rows[0].task.parts) && rows[0].task.parts.length === 2, "task 1 parts should parse from PART blocks");

  // Task 2 override must apply by task number and stay synced.
  assert(rows[1].task.n === 2, "row 1 should be task 2");
  assert(rows[1].overrideApplied === true, "task 2 should be marked overridden");
  assert(rows[1].task.text.includes("\\frac{E}{R}"), "task 2 override text missing");
  assert(rows[1].task.prompt === rows[1].task.text, "task 2 prompt should sync from override text");
  assert(Array.isArray(rows[1].task.parts) && rows[1].task.parts.length === 1, "task 2 parts should parse from override PART blocks");

  console.log("tasksTab.logic mergeOverrideTasks tests passed.");
}

run();

