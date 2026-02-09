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

  assert.strictEqual(brief?.header?.academicYear, "1");
  assert.ok(String(brief?.header?.internalVerifier || "").includes("Mohammed Hoq"));

  const tasks = Array.isArray(brief?.tasks) ? brief.tasks : [];
  const taskNumbers = new Set(tasks.map((t) => t.n));
  assert.ok(taskNumbers.has(1) && taskNumbers.has(2) && taskNumbers.has(3));

  const task1 = tasks.find((t) => t.n === 1);
  const task3 = tasks.find((t) => t.n === 3);
  assert.ok(task1 && String(task1.text || "").includes("Design Brief"));
  assert.ok(task3 && String(task3.text || "").toLowerCase().includes("debrief report must answer the following"));

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
