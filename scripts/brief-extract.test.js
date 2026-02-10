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

function loadBriefFromFixture(fixturePath) {
  const { pdfToText } = loadTsModule("lib/extraction/text/pdfToText.ts");
  const { extractBrief } = loadTsModule("lib/extractors/brief.ts");
  const buf = fs.readFileSync(fixturePath);
  return pdfToText(buf).then(({ text }) => extractBrief(text, path.basename(fixturePath)));
}

async function assertU4002Fixture() {
  const fixturePath = path.join(
    process.cwd(),
    "reference_uploads",
    "briefs",
    "U4002",
    "U4002 A1 202526.pdf"
  );

  assert.ok(fs.existsSync(fixturePath), `Missing fixture PDF: ${fixturePath}`);
  const brief = await loadBriefFromFixture(fixturePath);
  const tasks = Array.isArray(brief?.tasks) ? brief.tasks : [];
  assert.ok(tasks.length >= 2, "U4002 should include at least Task 1 and Task 2");

  const task1 = tasks.find((t) => t.n === 1);
  assert.ok(task1, "U4002 Task 1 should exist");
  const task1Text = String(task1.text || "");

  assert.ok(/length\s*\((?:ℓ|l)\)/i.test(task1Text), "Task 1 should include length (ℓ) or length (l)");
  assert.ok(!task1Text.includes("푙"), "Task 1 should not include corrupted 푙 glyph");
  assert.ok(!task1Text.includes("퐷"), "Task 1 should not include corrupted 퐷 glyph");
  assert.ok(!task1Text.includes("�"), "Task 1 should not include replacement char �");
  assert.ok(/60°/.test(task1Text), "Task 1 should include degree symbol 60°");
  assert.ok(/\bD\s*=/.test(task1Text) || /matrix\s+D\b/i.test(task1Text), "Task 1 should include matrix label D");

  const task1PartKeys = Array.isArray(task1.parts) ? task1.parts.map((part) => part.key) : [];
  const expectedTask1Order = ["h", "i", "j", "a", "a.i", "a.ii", "a.iii", "a.iv", "b", "b.i", "b.ii"];
  assert.deepStrictEqual(
    task1PartKeys,
    expectedTask1Order,
    `Task 1 part key sequence mismatch. Got: ${task1PartKeys.join(", ")}`
  );

  const task2 = tasks.find((t) => t.n === 2);
  assert.ok(task2, "U4002 Task 2 should exist");
  const task2PartKeys = Array.isArray(task2.parts) ? task2.parts.map((part) => part.key) : [];
  assert.deepStrictEqual(task2PartKeys, ["c", "d"], `Task 2 should be top-level c,d not nested. Got: ${task2PartKeys.join(", ")}`);
}

async function assertU4017Fixture() {
  const fixturePath = path.join(
    process.cwd(),
    "reference_uploads",
    "briefs",
    "U4017",
    "4017 A1 - Quality Control Tools and Costing.pdf"
  );

  assert.ok(fs.existsSync(fixturePath), `Missing fixture PDF: ${fixturePath}`);
  const brief = await loadBriefFromFixture(fixturePath);
  const tasks = Array.isArray(brief?.tasks) ? brief.tasks : [];
  assert.strictEqual(tasks.length, 3, "U4017 should include 3 tasks");

  const task2 = tasks.find((t) => t.n === 2);
  assert.ok(task2, "U4017 Task 2 should exist");
  const task2Tables = Array.isArray(task2.tables) ? task2.tables : [];
  const table21 = task2Tables.find((table) => String(table?.title || "").includes("Table 2.1"));
  assert.ok(table21, "Task 2 should include Table 2.1");
  assert.deepStrictEqual(
    table21.columns,
    ["Output Voltage (V)", "Before QC", "After QC"],
    "Task 2 table columns should match expected schema"
  );
  assert.strictEqual(Array.isArray(table21.rows) ? table21.rows.length : 0, 9, "Task 2 table should have 9 rows including Total");
  assert.ok(
    (table21.rows || []).some((row) => Array.isArray(row) && /^Total$/i.test(String(row[0] || "")) && String(row[1]) === "200" && String(row[2]) === "200"),
    "Task 2 table should include Total 200 200 row"
  );

  const task2Text = String(task2.text || "");
  assert.ok(!/\[TABLE:/i.test(task2Text), "Task 2 visible task text should not include [TABLE: ...] placeholders");
  assert.ok(!/Output Voltage\s*\(V\)\s*Before\s*QC\s*After\s*QC/i.test(task2Text), "Task 2 text should not contain flattened table header fragments");

  const task3 = tasks.find((t) => t.n === 3);
  assert.ok(task3, "U4017 Task 3 should exist");
  const task3Tables = Array.isArray(task3.tables) ? task3.tables : [];
  const task3Template = task3Tables.find((table) => table?.id === "task3-template");
  assert.ok(task3Template, "Task 3 accounting template table should be present");
  assert.deepStrictEqual(task3Template.columns, ["Item", "Before QC", "After QC"], "Task 3 accounting template should use Item|Before QC|After QC columns");

  const requiredRows = [
    "Gross Sales",
    "Units Sold",
    "Material Cost",
    "Net Sales",
    "Wages",
    "Rent",
    "Overheads",
    "Variances",
    "Net Profit/Loss",
  ];
  const rowLabels = (Array.isArray(task3Template.rows) ? task3Template.rows : []).map((row) => String((row || [])[0] || ""));
  requiredRows.forEach((label) => assert.ok(rowLabels.includes(label), `Task 3 template should include row: ${label}`));
}

async function run() {
  await assertU4002Fixture();
  await assertU4017Fixture();
  console.log("Brief extraction fixture test passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
