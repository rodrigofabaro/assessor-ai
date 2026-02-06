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
      const resolved = path.resolve(dirname, request);
      const withExt = resolved.endsWith(".ts") ? resolved : `${resolved}.ts`;
      if (fs.existsSync(withExt)) return loadTsModule(withExt);
      const indexTs = path.join(resolved, "index.ts");
      if (fs.existsSync(indexTs)) return loadTsModule(indexTs);
      return loadTsModule(withExt);
    }
    if (request.startsWith("@/")) {
      const resolved = path.resolve(process.cwd(), request.replace("@/", ""));
      const withExt = resolved.endsWith(".ts") ? resolved : `${resolved}.ts`;
      if (fs.existsSync(withExt)) return loadTsModule(withExt);
      const indexTs = path.join(resolved, "index.ts");
      if (fs.existsSync(indexTs)) return loadTsModule(indexTs);
      return loadTsModule(withExt);
    }
    return require(request);
  };

  const wrapped = new Function("require", "module", "exports", compiled);
  wrapped(localRequire, module, module.exports);
  cache.set(absPath, module.exports);
  return module.exports;
}

const fixtures = [
  "U4001 A1 Engineering Design - Sept 2025.pdf",
  "4017 A1 - Quality Control Tools and Costing.pdf",
  "U4002 A1 202526.pdf",
];

const headerFields = [
  "qualification",
  "unitNumberAndTitle",
  "assignmentTitle",
  "assessor",
  "unitCode",
  "internalVerifier",
  "verificationDate",
  "issueDate",
  "finalSubmissionDate",
  "academicYear",
];

async function run() {
  const { extractReferenceDocument } = loadTsModule("lib/extraction/index.ts");
  let exitCode = 0;

  for (const filename of fixtures) {
    const filePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing fixture PDF at ${filePath}`);
      exitCode = 1;
      continue;
    }

    const result = await extractReferenceDocument({
      type: "BRIEF",
      filePath,
      docTitleFallback: filename,
    });

    const extracted = result?.extractedJson || {};
    const title = String(extracted?.title || extracted?.header?.assignmentTitle || "").trim();
    const header = extracted?.header || {};
    const missingHeader = headerFields.filter((field) => !header?.[field]).length;

    const tasks = Array.isArray(extracted?.tasks) ? extracted.tasks : [];
    const criteriaCodes = Array.isArray(extracted?.detectedCriterionCodes) ? extracted.detectedCriterionCodes : [];
    const counts = criteriaCodes.reduce(
      (acc, code) => {
        const band = String(code || "").trim().toUpperCase().slice(0, 1);
        if (band === "P") acc.p += 1;
        if (band === "M") acc.m += 1;
        if (band === "D") acc.d += 1;
        return acc;
      },
      { p: 0, m: 0, d: 0 }
    );

    console.log(
      `${filename} title="${title}" headerMissing=${missingHeader} tasks=${tasks.length} criteria=P${counts.p} M${counts.m} D${counts.d}`
    );

    if (tasks.length === 0) exitCode = 1;
    if (filename.startsWith("U4001") && tasks.length !== 3) exitCode = 1;
  }

  process.exit(exitCode);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
