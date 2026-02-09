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

type Fixture = {
  filename: string;
  expectedTasks?: number[];
  expectedCount?: number;
};

const fixtures: Fixture[] = [
  {
    filename: "U4001 A1 Engineering Design - Sept 2025.pdf",
    expectedTasks: [1, 2, 3],
  },
  {
    filename: "4017 A1 - Quality Control Tools and Costing.pdf",
    expectedCount: 3,
  },
  {
    filename: "4017 A2 - Industry Standards and Total Quality Mang'.pdf",
    expectedCount: 2,
  },
];

function truncate(text: string, limit = 200) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned;
}

async function runFixture(fixture: Fixture) {
  const filePath = path.join(process.cwd(), "reference_uploads", fixture.filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing fixture: ${filePath}`);
  }

  const { pdfToText } = loadTsModule("lib/extraction/text/pdfToText.ts");
  const { extractBrief } = loadTsModule("lib/extractors/brief.ts");

  const buf = fs.readFileSync(filePath);
  const { text, pageCount } = await pdfToText(buf);
  const hasFormFeedBreaks = /\f|\u000c/.test(text);
  const brief = extractBrief(text, path.basename(filePath));
  const tasks = Array.isArray(brief?.tasks) ? brief.tasks : [];
  const realTasks = tasks.filter((task) => task.n > 0);

  console.log(`\n=== ${fixture.filename} ===`);
  console.log(`pageCount=${pageCount} hasFormFeedBreaks=${hasFormFeedBreaks}`);
  console.log(`tasksFound=${realTasks.length}`);

  for (const task of realTasks) {
    const title = task.title ? ` — ${task.title}` : "";
    const pages = Array.isArray(task.pages) ? task.pages.join(",") : "n/a";
    console.log(
      `Task ${task.n}${title} | pages=[${pages}] | chars=${(task.text || "").length} | confidence=${task.confidence}`
    );
    console.log(`  ${truncate(task.text)}`);
  }

  const errors: string[] = [];
  if (fixture.expectedTasks?.length) {
    const taskNumbers = new Set(realTasks.map((task) => task.n));
    for (const expected of fixture.expectedTasks) {
      if (!taskNumbers.has(expected)) {
        errors.push(`Missing Task ${expected}.`);
      }
    }
  }

  if (typeof fixture.expectedCount === "number" && realTasks.length !== fixture.expectedCount) {
    errors.push(`Expected ${fixture.expectedCount} tasks, found ${realTasks.length}.`);
  }

  if (errors.length) {
    throw new Error(errors.join(" "));
  }
}

async function run() {
  for (const fixture of fixtures) {
    await runFixture(fixture);
  }
  console.log("\nBrief extraction smoke test passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
