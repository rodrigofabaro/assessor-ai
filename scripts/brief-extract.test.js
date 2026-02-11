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

function readFixture(name) {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", name);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Missing fixture: ${fixturePath}`);
  }
  return fs.readFileSync(fixturePath, "utf8");
}

function run() {
  const { detectTableBlocks } = loadTsModule("lib/extraction/render/tableBlocks.ts");

  const task2Raw = readFixture("4017_task2_table_raw.txt");
  const task3Raw = readFixture("4017_task3_table_raw.txt");

  const task2Blocks = detectTableBlocks({ text: task2Raw });
  const task2Table = task2Blocks.find((b) => b.kind === "TABLE");
  assert.ok(task2Table, "Task 2 table should be parsed");
  assert.ok(task2Table.caption && task2Table.caption.includes("Table 2.1"));
  assert.deepStrictEqual(task2Table.headers, ["Output Voltage (V)", "Before QC", "After QC"]);
  assert.ok(task2Table.rows.some((row) => row[0] === "Total" && row[1] === "200" && row[2] === "200"));

  const task3Blocks = detectTableBlocks({ text: task3Raw });
  const task3Table = task3Blocks.find((b) => b.kind === "TABLE");
  assert.ok(task3Table, "Task 3 table should be parsed");
  assert.deepStrictEqual(task3Table.headers, ["Month", "Before QC", "After QC"]);
  assert.ok(task3Table.rows.some((row) => row[0] === "Net Profit/Loss" && row[1] === "£" && row[2] === "£"));
  assert.ok(task3Table.rows.some((row) => row[0] === "Units Produced" && row[1] === "" && row[2] === ""));

  console.log("Table block text-fixture test passed.");
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
