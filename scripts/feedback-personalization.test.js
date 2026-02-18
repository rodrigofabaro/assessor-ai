#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const cache = new Map();

function resolveTsLike(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

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

  const mod = { exports: {} };
  const dirname = path.dirname(absPath);
  const localRequire = (request) => {
    if (request.startsWith(".")) {
      const resolved = resolveTsLike(path.resolve(dirname, request));
      if (resolved) return loadTsModule(resolved);
    }
    if (request.startsWith("@/")) {
      const resolved = resolveTsLike(path.resolve(process.cwd(), request.slice(2)));
      if (resolved) return loadTsModule(resolved);
    }
    return require(request);
  };

  const wrapped = new Function("require", "module", "exports", compiled);
  wrapped(localRequire, mod, mod.exports);
  cache.set(absPath, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const { extractFirstNameForFeedback, personalizeFeedbackSummary } = loadTsModule(
    "lib/grading/feedbackPersonalization.ts"
  );

  const a = extractFirstNameForFeedback({
    studentFullName: "Rodrigo Silva",
    coverStudentName: null,
  });
  assert(a === "Rodrigo", "expected first name from student profile");

  const b = extractFirstNameForFeedback({
    studentFullName: null,
    coverStudentName: "Student Name: Dr Alice Johnson",
  });
  assert(b === "Alice", "expected first non-honorific from cover name");

  const c = personalizeFeedbackSummary("strong work across pass criteria.", "Rodrigo");
  assert(c.startsWith("Rodrigo, "), "expected personalized summary prefix");

  const d = personalizeFeedbackSummary("Rodrigo, clear evidence was provided.", "Rodrigo");
  assert(d === "Rodrigo, clear evidence was provided.", "expected no double-prefix");

  console.log("feedback personalization tests passed.");
}

run();

