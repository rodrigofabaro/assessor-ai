#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/brief-extract.test.js <pdfPath> --out <jsonPath>
 *   node scripts/brief-extract.test.js <pdfPath> --assert <expectedJsonPath>
 */

const fs = require("fs");
const path = require("path");
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

function parseArgs(argv) {
  const args = argv.slice(2);
  if (!args[0]) throw new Error("Missing required <pdfPath> argument.");

  const pdfPath = path.resolve(args[0]);
  const outIndex = args.indexOf("--out");
  const assertIndex = args.indexOf("--assert");
  if (outIndex !== -1 && assertIndex !== -1) {
    throw new Error("Use either --out or --assert, not both.");
  }
  if (outIndex === -1 && assertIndex === -1) {
    throw new Error("Missing mode. Use --out <jsonPath> or --assert <expectedJsonPath>.");
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Fixture PDF missing: ${pdfPath}`);
  }

  if (outIndex !== -1) {
    const outPath = args[outIndex + 1];
    if (!outPath) throw new Error("Missing value for --out.");
    return { mode: "out", pdfPath, targetPath: path.resolve(outPath) };
  }

  const expected = args[assertIndex + 1];
  if (!expected) throw new Error("Missing value for --assert.");
  const targetPath = path.resolve(expected);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Expected snapshot missing: ${targetPath}`);
  }
  return { mode: "assert", pdfPath, targetPath };
}

function normalizeSnapshot(obj) {
  if (Array.isArray(obj)) return obj.map(normalizeSnapshot);
  if (!obj || typeof obj !== "object") return obj;

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (["generatedAt", "id", "uuid"].includes(k)) continue;
    if (typeof v === "undefined") continue;
    out[k] = normalizeSnapshot(v);
  }
  return out;
}

function collectDiffs(actual, expected, prefix = "") {
  const diffs = [];

  if (typeof actual !== typeof expected) {
    diffs.push(`${prefix || "<root>"}: type mismatch (${typeof actual} !== ${typeof expected})`);
    return diffs;
  }

  if (Array.isArray(actual)) {
    const max = Math.max(actual.length, expected.length);
    for (let i = 0; i < max; i += 1) {
      if (i >= actual.length) diffs.push(`${prefix}[${i}]: missing in actual`);
      else if (i >= expected.length) diffs.push(`${prefix}[${i}]: unexpected extra item`);
      else diffs.push(...collectDiffs(actual[i], expected[i], `${prefix}[${i}]`));
      if (diffs.length >= 40) break;
    }
    return diffs;
  }

  if (actual && typeof actual === "object") {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    for (const k of keys) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (!(k in actual)) diffs.push(`${p}: missing in actual`);
      else if (!(k in expected)) diffs.push(`${p}: unexpected key in actual`);
      else diffs.push(...collectDiffs(actual[k], expected[k], p));
      if (diffs.length >= 40) break;
    }
    return diffs;
  }

  if (actual !== expected) {
    diffs.push(`${prefix || "<root>"}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }

  return diffs;
}

async function extractSnapshot(pdfPath) {
  const { pdfToText } = loadTsModule("lib/extraction/text/pdfToText.ts");
  const { extractBrief } = loadTsModule("lib/extractors/brief.ts");
  const { detectTableBlocks } = loadTsModule("lib/extraction/render/tableBlocks.ts");

  const buf = fs.readFileSync(pdfPath);
  const { text, pageCount, equations } = await pdfToText(buf);
  const brief = extractBrief(text, path.basename(pdfPath), { equations });

  const tasks = (brief.tasks || []).map((task) => ({
    n: task.n,
    label: task.label,
    title: task.title || null,
    pages: task.pages || [],
    text: task.text,
    parts: task.parts || [],
    scenarioText: task.scenarioText || null,
    tableBlocks: detectTableBlocks(task),
    warnings: task.warnings || [],
  }));

  return {
    kind: brief.kind,
    title: brief.title,
    assignmentCode: brief.assignmentCode || null,
    unitCodeGuess: brief.unitCodeGuess || null,
    pageCount,
    header: brief.header || null,
    equations: brief.equations || [],
    tasks,
    warnings: brief.warnings || [],
    endMatter: brief.endMatter || null,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const snapshot = normalizeSnapshot(await extractSnapshot(args.pdfPath));

  if (args.mode === "out") {
    fs.mkdirSync(path.dirname(args.targetPath), { recursive: true });
    fs.writeFileSync(args.targetPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    console.log(`Wrote snapshot: ${args.targetPath}`);
    return;
  }

  const expected = normalizeSnapshot(JSON.parse(fs.readFileSync(args.targetPath, "utf8")));
  const diffs = collectDiffs(snapshot, expected);
  if (diffs.length) {
    console.error(`Snapshot mismatch (${diffs.length} differences shown up to 40):`);
    for (const diff of diffs) console.error(` - ${diff}`);
    process.exit(1);
  }

  const taskNums = snapshot.tasks.map((t) => t.n);
  const hasTask3 = taskNums.includes(3) && String(snapshot.tasks.find((t) => t.n === 3)?.text || "").trim().length > 30;
  if (!hasTask3) {
    console.error("WARNING: Task 3 missing or empty.");
    process.exit(1);
  }

  const hasReadableTable = snapshot.tasks.some((t) =>
    (t.tableBlocks || []).some((b) => b.kind === "TABLE" || /\S\s{2,}\S/.test(String(b.text || "")))
  );
  if (!hasReadableTable) {
    console.error("WARNING: table alignment degraded (no aligned table-like region detected).");
    process.exit(1);
  }

  const fixtureName = path.basename(args.pdfPath).toLowerCase();
  const assignmentCode = String(snapshot.assignmentCode || "").toUpperCase();
  const unitCodeGuess = String(snapshot.unitCodeGuess || "").trim();

  if (fixtureName.includes("u4002") && assignmentCode === "A1") {
    const task2 = snapshot.tasks.find((t) => t.n === 2);
    if (!task2) {
      console.error("WARNING: U4002 expected Task 2 but none found.");
      process.exit(1);
    }
    const partMap = new Map((task2.parts || []).map((p) => [String(p.key || "").toLowerCase(), String(p.text || "")]));
    const aText = partMap.get("a") || "";
    const bIiText = partMap.get("b.ii") || "";
    if (!/sample\s+1\s+2\s+3/i.test(aText) || !/power\s*\(\+?dbm\)/i.test(aText)) {
      console.error("WARNING: U4002 table not anchored in Task 2 part a.");
      process.exit(1);
    }
    if (/sample\s+1\s+2\s+3/i.test(bIiText)) {
      console.error("WARNING: U4002 table still appended to Task 2 part b.ii.");
      process.exit(1);
    }
    const hasSampleTableBlock = (task2.tableBlocks || []).some((b) => {
      if (b.kind !== "TABLE") return false;
      const headers = Array.isArray(b.headers) ? b.headers.map((h) => String(h).toLowerCase()) : [];
      return headers.includes("sample") || /sample/i.test(String(b.caption || ""));
    });
    if (!hasSampleTableBlock) {
      console.error("WARNING: U4002 expected Sample/Power table block not detected.");
      process.exit(1);
    }
  }

  if ((fixtureName.includes("u4002") && assignmentCode === "A2") || (unitCodeGuess === "4002" && assignmentCode === "A2")) {
    const taskNumbers = snapshot.tasks.map((t) => Number(t.n)).filter((n) => Number.isFinite(n));
    const expected = [1, 2, 3, 4];
    if (taskNumbers.length !== 4 || expected.some((n, idx) => taskNumbers[idx] !== n)) {
      console.error(`WARNING: U4002 A2 expected task sequence ${expected.join(",")} but got ${taskNumbers.join(",")}.`);
      process.exit(1);
    }

    const task4 = snapshot.tasks.find((t) => Number(t.n) === 4);
    if (!task4) {
      console.error("WARNING: U4002 A2 expected Task 4 but none found.");
      process.exit(1);
    }
    const task4Parts = new Map((task4.parts || []).map((p) => [String(p.key || "").toLowerCase(), String(p.text || "")]));
    const aText = task4Parts.get("a") || "";
    const cText = task4Parts.get("c") || "";
    if (!/Task 1 \(a\)\.\nProvide a screenshot/i.test(aText)) {
      console.error("WARNING: U4002 A2 expected Task 4(a) line break before 'Provide a screenshot'.");
      process.exit(1);
    }
    if (!/Task 1 \(b\)\.\nProvide a screenshot/i.test(cText)) {
      console.error("WARNING: U4002 A2 expected Task 4(c) line break before 'Provide a screenshot'.");
      process.exit(1);
    }
  }

  if (fixtureName.includes("4017") && fixtureName.includes("a1")) {
    const task1 = snapshot.tasks.find((t) => t.n === 1);
    if (!task1) {
      console.error("WARNING: 4017 A1 expected Task 1 but none found.");
      process.exit(1);
    }
    const task1Text = String(task1.text || "");
    const task1Scenario = String(task1.scenarioText || "");
    if (!/in a bid to convince the ceo/i.test(task1Text)) {
      console.error("WARNING: 4017 A1 expected Task 1 intro line in task text.");
      process.exit(1);
    }
    if (!/you'?ve recently joined/i.test(task1Scenario)) {
      console.error("WARNING: 4017 A1 expected vocational scenario text for Task 1.");
      process.exit(1);
    }

    const task2 = snapshot.tasks.find((t) => t.n === 2);
    if (!task2) {
      console.error("WARNING: 4017 A1 expected Task 2 but none found.");
      process.exit(1);
    }
    const task2PartMap = new Map((task2.parts || []).map((p) => [String(p.key || "").toLowerCase(), String(p.text || "")]));
    const t2a = task2PartMap.get("a") || "";
    const t2bii = task2PartMap.get("b.ii") || "";
    const t2c = task2PartMap.get("c") || "";
    if (!/sample\s+1\s+2\s+3/i.test(t2a) || !/power\s*\(\+?dbm\)/i.test(t2a)) {
      console.error("WARNING: 4017 A1 expected Sample/Power lines in Task 2 part a.");
      process.exit(1);
    }
    if (/sample\s+1\s+2\s+3/i.test(t2bii)) {
      console.error("WARNING: 4017 A1 Sample/Power lines leaked into Task 2 part b.ii.");
      process.exit(1);
    }
    if (!/standard deviation of\s+12\s*[μu]f/i.test(t2c.replace(/\n+/g, " "))) {
      console.error("WARNING: 4017 A1 expected Task 2 part c to keep 'standard deviation of 12μF' contiguous.");
      process.exit(1);
    }
    const t2SampleTable = (task2.tableBlocks || []).find(
      (b) => b.kind === "TABLE" && Array.isArray(b.headers) && String(b.headers[0] || "").toLowerCase() === "sample"
    );
    if (!t2SampleTable) {
      console.error("WARNING: 4017 A1 expected Sample table block for Task 2.");
      process.exit(1);
    }

    const task3 = snapshot.tasks.find((t) => t.n === 3);
    if (!task3) {
      console.error("WARNING: 4017 A1 expected Task 3 but none found.");
      process.exit(1);
    }
    const t3Table = (task3.tableBlocks || []).find(
      (b) =>
        b.kind === "TABLE" &&
        Array.isArray(b.headers) &&
        /^month$/i.test(String(b.headers[0] || "")) &&
        /before\s+qc/i.test(String(b.headers[1] || "")) &&
        /after\s+qc/i.test(String(b.headers[2] || ""))
    );
    if (!t3Table) {
      console.error("WARNING: 4017 A1 expected Task 3 costing template table block.");
      process.exit(1);
    }
    const t3Rows = Array.isArray(t3Table.rows) ? t3Table.rows.map((r) => String((r || [])[0] || "").toLowerCase()) : [];
    if (!t3Rows.includes("units sold") || !t3Rows.includes("net profit/loss")) {
      console.error("WARNING: 4017 A1 expected Task 3 table rows 'Units Sold' and 'Net Profit/Loss'.");
      process.exit(1);
    }
  }

  console.log(`Snapshot assert passed: ${args.targetPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
