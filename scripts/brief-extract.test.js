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
  if (!fs.existsSync(fixturePath)) throw new Error(`Missing text fixture: ${fixturePath}`);
  return fs.readFileSync(fixturePath, "utf8");
}

async function getU4002Text() {
  const fixturePdf = "/mnt/data/U4002 A1 202526.pdf";
  if (fs.existsSync(fixturePdf)) {
    const { pdfToText } = loadTsModule("lib/extraction/text/pdfToText.ts");
    const buf = fs.readFileSync(fixturePdf);
    const out = await pdfToText(buf);
    return { text: out.text, source: fixturePdf };
  }

  return {
    text: loadFixture("u4002_a1_pdfToText.txt"),
    source: "tests/fixtures/u4002_a1_pdfToText.txt",
  };
}

function partKeys(task) {
  return (Array.isArray(task?.parts) ? task.parts : []).map((p) => String(p.key || "").toLowerCase());
}

async function run() {
  const { extractBrief } = loadTsModule("lib/extractors/brief.ts");

  const u4001Text = loadFixture("u4001_a1_pdfToText.txt");
  const { text: u4002Text, source } = await getU4002Text();

  const u4001 = extractBrief(u4001Text, "u4001_a1_pdfToText.txt");
  const u4002 = extractBrief(u4002Text, path.basename(source));

  assert.ok(Array.isArray(u4001.tasks) && u4001.tasks.length >= 1, "U4001 should produce tasks");
  assert.ok(Array.isArray(u4002.tasks) && u4002.tasks.length >= 1, "U4002 should produce tasks");

  assert.strictEqual((u4002Text.match(/\uFFFD|�/g) || []).length, 0, "Expected zero replacement chars in extracted text");
  assert.ok(!/[\u{1D400}-\u{1D7FF}\uD479]/u.test(u4002Text), "Expected normalized math letters (no math italic glyphs)");
  assert.ok(!/\b60\s*\n\s*o\b/i.test(u4002Text), "Expected normalized degree marker (not 60\\no)");

  const task1 = u4002.tasks.find((t) => t.n === 1);
  const task2 = u4002.tasks.find((t) => t.n === 2);
  assert.ok(task1, "U4002 Task 1 should exist");
  assert.ok(task2, "U4002 Task 2 should exist");

  const keys1 = partKeys(task1);
  const keys2 = partKeys(task2);

  if (source.includes("/mnt/data/")) {
    ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].forEach((k) =>
      assert.ok(keys1.includes(k), `Task 1 should include part ${k}`)
    );
    ["a", "b", "c", "d"].forEach((k) => assert.ok(keys2.includes(k), `Task 2 should include part ${k}`));
  } else {
    console.warn("⚠️ Using repository text fixture fallback (missing /mnt/data/U4002 A1 202526.pdf); strict part-key assertions skipped.");
    assert.ok(keys1.includes("a"), "Fallback fixture should still include Task 1 part a");
  }

  console.log(`Brief extraction regression test passed (${source}).`);
}

run().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
