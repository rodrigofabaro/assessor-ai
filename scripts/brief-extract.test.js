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
    tableBlocks: detectTableBlocks(task),
    warnings: task.warnings || [],
  }));

  return {
    kind: brief.kind,
    title: brief.title,
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

  console.log(`Snapshot assert passed: ${args.targetPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
