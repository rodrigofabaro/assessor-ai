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

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(relPath), "utf8"));
}

function run() {
  const { detectTableBlocks } = loadTsModule("lib/extraction/render/tableBlocks.ts");

  const snapshot = loadJson("tests/fixtures/U4002_A1_202526.expected.json");
  const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  assert(tasks.length >= 3, "expected fixture to contain at least 3 tasks");
  for (const task of tasks) {
    const pages = Array.isArray(task.pages) ? task.pages : [];
    assert(pages.length > 0, `task ${task.n} must keep page references`);
    for (let i = 1; i < pages.length; i += 1) {
      assert(Number(pages[i]) >= Number(pages[i - 1]), `task ${task.n} pages must be ordered`);
    }
  }

  const task2 = tasks.find((t) => Number(t.n) === 2);
  assert(task2, "expected Task 2 fixture");
  const task2Tables = Array.isArray(task2.tableBlocks) ? task2.tableBlocks : [];
  const foundDriversTable = task2Tables.some(
    (b) => b.kind === "TABLE" && Array.isArray(b.headers) && /output voltage/i.test(String(b.headers[0] || ""))
  );
  assert(foundDriversTable, "expected Task 2 voltage table to remain structured");

  const synthetic = loadJson("tests/fixtures/extraction_page_eq_table.fixture.json");
  const syntheticTask = synthetic.tasks[0];
  const syntheticText = String(syntheticTask.text || "");
  const eqTokens = syntheticText.match(/\[\[EQ:([^\]]+)\]\]/g) || [];
  assert(eqTokens.length > 0, "synthetic fixture should include equation placeholder");
  const eqIds = new Set((synthetic.equations || []).map((e) => String(e.id || "")));
  for (const token of eqTokens) {
    const id = token.slice(5, -2);
    assert(eqIds.has(id), `equation placeholder ${id} must resolve to extracted equation entry`);
  }

  const blocks = detectTableBlocks(syntheticTask);
  const hasSampleTable = blocks.some(
    (b) => b.kind === "TABLE" && Array.isArray(b.headers) && String(b.headers[0] || "").toLowerCase() === "sample"
  );
  assert(hasSampleTable, "synthetic sample/power table should be detected as structured TABLE");

  console.log("extraction integrity tests passed.");
}

run();
