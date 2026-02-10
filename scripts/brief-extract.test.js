const fs = require("fs");
const path = require("path");
const assert = require("assert");
const ts = require("typescript");

const cache = new Map();

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

  const module = { exports: {} };
  const dirname = path.dirname(absPath);

  const localRequire = (request) => {
    if (request.startsWith(".")) {
      const resolved = path.resolve(dirname, request.endsWith(".ts") ? request : `${request}.ts`);
      return loadTsModule(resolved);
    }
    return require(request);
  };

  const wrapped = new Function("require", "module", "exports", compiled);
  wrapped(localRequire, module, module.exports);
  cache.set(absPath, module.exports);
  return module.exports;
}

function loadFixture(name) {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", name);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Missing text fixture: ${fixturePath}`);
  }
  return fs.readFileSync(fixturePath, "utf8");
}

function run() {
  const { extractBrief } = loadTsModule("lib/extractors/brief.ts");
  const { parseParts } = loadTsModule("lib/extraction/render/parseParts.ts");
  const { detectTableBlocks } = loadTsModule("lib/extraction/render/tableBlocks.ts");

  const u4001Text = loadFixture("u4001_a1_pdfToText.txt");
  const u4002Text = loadFixture("u4002_a1_pdfToText.txt");

  const u4001 = extractBrief(u4001Text, "u4001_a1_pdfToText.txt");
  const u4002 = extractBrief(u4002Text, "u4002_a1_pdfToText.txt");

  assert.ok(Array.isArray(u4001.tasks) && u4001.tasks.length >= 3, "U4001 should produce at least 3 tasks");
  assert.ok(Array.isArray(u4002.tasks) && u4002.tasks.length >= 2, "U4002 should produce at least 2 tasks");

  const task1 = u4002.tasks.find((t) => t.n === 1);
  assert.ok(task1, "U4002 Task 1 should exist");

  const parts = parseParts(task1.text || "", task1.parts);
  const partA = parts.find((p) => p.key === "a");
  assert.ok(partA, "U4002 Task 1 should include top-level part a");
  const romanKeys = (partA.children || []).map((child) => child.key);
  assert.deepStrictEqual(romanKeys, ["a.i", "a.ii", "a.iii", "a.iv"], "Expected roman sub-parts under a)");

  const topLevelKeys = parts.map((p) => p.key);
  assert.ok(topLevelKeys.includes("h") && topLevelKeys.includes("i") && topLevelKeys.includes("j"), "Expected top-level h, i, j parts");

  const tableBlocks = detectTableBlocks(task1);
  assert.ok(tableBlocks.length >= 1, "Expected at least one detected table block in U4002 Task 1");

  assert.ok(/  /.test(task1.text || ""), "Expected preserved multi-space gap in U4002 Task 1 raw text");

  console.log("Brief extraction text fixture regression test passed.");
}

try {
  run();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
