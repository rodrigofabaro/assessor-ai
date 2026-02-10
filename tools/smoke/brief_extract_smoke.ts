import fs from "fs";
import path from "path";
import ts from "typescript";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const cache = new Map<string, any>();

function loadTsModule(filePath: string) {
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

  const module = { exports: {} as any };
  const dirname = path.dirname(absPath);

  const localRequire = (request: string) => {
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

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function extractFixture(filePath: string) {
  const { pdfToText } = loadTsModule("lib/extraction/text/pdfToText.ts");
  const { extractBrief } = loadTsModule("lib/extractors/brief.ts");
  const buf = fs.readFileSync(filePath);
  const { text, pageCount } = await pdfToText(buf);
  const brief = extractBrief(text, path.basename(filePath));
  const tasks = Array.isArray(brief?.tasks) ? brief.tasks.filter((task: any) => Number(task?.n) > 0) : [];
  return { brief, tasks, pageCount };
}

function normalizeRows(rows: string[][]) {
  return rows.map((row) => row.map((cell) => String(cell || "").trim()));
}

async function runU4017Checks() {
  const filePath = path.join(process.cwd(), "reference_uploads/briefs/U4017/4017 A1 - Quality Control Tools and Costing.pdf");
  assert(fs.existsSync(filePath), `Missing fixture: ${filePath}`);
  const { tasks, pageCount } = await extractFixture(filePath);
  console.log(`U4017 pages=${pageCount} tasks=${tasks.length}`);

  const task1 = tasks.find((task: any) => task.n === 1);
  assert(task1, "U4017 Task 1 missing.");
  const partKeys = (task1.parts || []).map((part: any) => String(part?.key || "").trim());
  assert(partKeys.length === 2, `U4017 Task 1 expected 2 parts, found ${partKeys.length}.`);
  assert(partKeys.join(",") === "a,b", `U4017 Task 1 part keys expected 'a,b', found '${partKeys.join(",")}'.`);

  const task2 = tasks.find((task: any) => task.n === 2);
  assert(task2, "U4017 Task 2 missing.");
  const table21 = (task2.tables || []).find((table: any) => String(table?.id || "") === "table-2.1");
  assert(table21, "U4017 Task 2 expected table-2.1.");
  assert(Array.isArray(table21.columns) && table21.columns.length === 3, `U4017 Task 2 expected 3 columns, found ${(table21.columns || []).length}.`);
  assert(Array.isArray(table21.rows) && table21.rows.length === 9, `U4017 Task 2 expected 9 rows, found ${(table21.rows || []).length}.`);
  const normalizedRows = normalizeRows(table21.rows || []);
  const totalRow = normalizedRows.find((row) => row[0] === "Total");
  assert(!!totalRow, "U4017 Task 2 missing Total row.");
  assert((task2.text || "").includes("[TABLE: table-2.1]"), "U4017 Task 2 should include table placeholder in text.");
  assert(!/before\s*\n\s*qc|after\s*\n\s*qc/i.test(task2.text || ""), "U4017 Task 2 should not contain flattened QC lines.");

  const task3 = tasks.find((task: any) => task.n === 3);
  assert(task3, "U4017 Task 3 missing.");
  const task3Table = (task3.tables || []).find((table: any) => String(table?.id || "") === "task3-template");
  assert(task3Table, "U4017 Task 3 expected task3-template.");
  assert(Array.isArray(task3Table.rows) && task3Table.rows.length >= 10, `U4017 Task 3 expected >=10 template rows, found ${(task3Table.rows || []).length}.`);
  const requiredLabels = [
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
  ];
  const presentLabels = new Set((task3Table.rows || []).map((row: string[]) => String(row?.[0] || "").trim()));
  requiredLabels.forEach((label) => assert(presentLabels.has(label), `U4017 Task 3 missing row label '${label}'.`));
  assert(String(task3Table.columns?.[0] || "") === "Month/Item", `U4017 Task 3 first column expected 'Month/Item', found '${String(task3Table.columns?.[0] || "")}'.`);
}

async function runU4002Checks() {
  const filePath = path.join(process.cwd(), "reference_uploads/briefs/U4002/U4002 A1 202526.pdf");
  assert(fs.existsSync(filePath), `Missing fixture: ${filePath}`);
  const { tasks, pageCount } = await extractFixture(filePath);
  console.log(`U4002 pages=${pageCount} tasks=${tasks.length}`);

  const allPartKeys: string[] = tasks.flatMap((task: any) => (task.parts || []).map((part: any) => String(part?.key || "").trim()));
  const uniqueKeys = new Set(allPartKeys);
  assert(uniqueKeys.size === allPartKeys.length, `U4002 part keys must be unique; found duplicates in [${allPartKeys.join(", ")}].`);
  const hierarchicalKeys = allPartKeys.filter((key) => key.includes("."));
  assert(hierarchicalKeys.length > 0, "U4002 expected hierarchical part keys like a.i / b.ii.");

  const task1 = tasks.find((task: any) => task.n === 1);
  assert(task1, "U4002 Task 1 missing.");
  const formulas = Array.isArray(task1.formulas) ? task1.formulas : [];
  const matrix = formulas.find((entry: any) => entry?.kind === "matrix");
  assert(matrix, "U4002 expected matrix formula block.");
  assert(Array.isArray(matrix.rows) && matrix.rows.length === 2, `U4002 matrix expected 2 rows, found ${(matrix?.rows || []).length}.`);
  const rowWidths = (matrix.rows || []).map((row: string[]) => row.length);
  assert(rowWidths.every((width: number) => width === 2), `U4002 matrix expected 2 columns per row, found [${rowWidths.join(",")}].`);
}

async function run() {
  await runU4017Checks();
  await runU4002Checks();
  console.log("Brief extraction smoke test passed.");
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
