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

async function run() {
  const fixturePath =
    process.env.BRIEF_PDF_PATH ||
    path.join(process.cwd(), "reference_uploads", "briefs", "U4001", "U4001 A1 Engineering Design - Sept 2025.pdf");

  if (!fs.existsSync(fixturePath)) {
    console.error(`Missing fixture PDF. Set BRIEF_PDF_PATH or add the file at: ${fixturePath}`);
    process.exit(1);
  }

  const { pdfToText } = loadTsModule("lib/extraction/text/pdfToText.ts");
  const { extractBrief } = loadTsModule("lib/extractors/brief.ts");

  const buf = fs.readFileSync(fixturePath);
  const { text } = await pdfToText(buf);
  const brief = extractBrief(text, path.basename(fixturePath));

  const fixtureName = path.basename(fixturePath);
  if (!/4017\s*A1/i.test(fixtureName)) {
    assert.strictEqual(brief?.header?.academicYear, "1");
    assert.ok(String(brief?.header?.internalVerifier || "").includes("Mohammed Hoq"));
  }

  const tasks = Array.isArray(brief?.tasks) ? brief.tasks : [];
  const taskNumbers = new Set(tasks.map((t) => t.n));
  assert.ok(taskNumbers.has(1) && taskNumbers.has(2) && taskNumbers.has(3));

  if (/4017\s*A1/i.test(fixtureName)) {
    assert.strictEqual(tasks.length, 3, "Expected 3 tasks");

    const task2 = tasks.find((t) => t.n === 2);
    assert.ok(task2, "Task 2 should exist");
    const task2Tables = Array.isArray(task2.tables) ? task2.tables : [];
    assert.ok(task2Tables.length >= 1, "Task 2 should include a table");
    const table21 = task2Tables[0];
    assert.ok(String(table21.title || "").includes("Table 2.1"), "Task 2 table title should mention Table 2.1");
    assert.strictEqual(Array.isArray(table21.columns) ? table21.columns.length : 0, 3, "Table 2.1 should have 3 columns");
    assert.strictEqual(Array.isArray(table21.rows) ? table21.rows.length : 0, 9, "Table 2.1 should have 9 rows");

    const task2Text = String(task2.text || "");
    assert.ok(!/Output Voltage\n\(V\)\nBefore\nQC\nAfter\nQC/i.test(task2Text), "Task 2 text should not contain flattened header fragments");

    const task3 = tasks.find((t) => t.n === 3);
    assert.ok(task3, "Task 3 should exist");
    const task3Tables = Array.isArray(task3.tables) ? task3.tables : [];
    const task3Template = task3Tables.find((t) => Array.isArray(t.columns) && t.columns.join("|") === "Month|Before QC|After QC");
    assert.ok(task3Template, "Task 3 template table should be present");

    const rowLabels = (Array.isArray(task3Template.rows) ? task3Template.rows : []).map((row) => row[0]);
    [
      "Units Produced",
      "Gross Sales",
      "Units Sold",
      "Material Cost",
      "Net Sales",
      "Wages",
      "Rent",
      "Overheads",
      "Variances",
      "Net Profit/Loss",
    ].forEach((label) => assert.ok(rowLabels.includes(label), `Task 3 template should include row: ${label}`));

    tasks.forEach((task) => {
      assert.ok(Array.isArray(task.pages) && task.pages.length > 0, `Task ${task.n} should have pages`);
      const taskText = String(task.text || "").toLowerCase();
      assert.ok(!taskText.includes("sources of information"), `Task ${task.n} should not leak end matter`);
    });
  } else {
    const task1 = tasks.find((t) => t.n === 1);
    const task3 = tasks.find((t) => t.n === 3);
    assert.ok(task1 && String(task1.text || "").includes("Design Brief"));
    assert.ok(task3 && String(task3.text || "").toLowerCase().includes("debrief report must answer the following"));
  }

  console.log(`Tasks detected: ${tasks.length}`);
  tasks.forEach((task) => {
    const partKeys = Array.isArray(task.parts) ? task.parts.map((p) => p.key).join(", ") : "";
    const tables = Array.isArray(task.tables) ? task.tables : [];
    const tableIds = tables.map((t) => t.id).join(", ");
    console.log(
      `Task ${task.n}: parts=[${partKeys}] tables=${tables.length}${tableIds ? ` (${tableIds})` : ""}`
    );
  });

  console.log("Brief extraction fixture test passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
