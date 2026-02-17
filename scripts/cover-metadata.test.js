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
  const { extractCoverMetadataFromPages, isCoverMetadataReady } = loadTsModule("lib/submissions/coverMetadata.ts");

  const pages = [
    {
      pageNumber: 1,
      text: `
        Student Name: Jane Doe
        Student ID: 998877
        Unit: 4003
        Assignment: A1
        Submission Date: 17/02/2026
      `,
    },
    {
      pageNumber: 2,
      text: "I declare this work is my own.",
    },
  ];

  const cover = extractCoverMetadataFromPages(pages);
  assert(cover.studentName?.value === "Jane Doe", "expected studentName extraction");
  assert(cover.studentId?.value === "998877", "expected studentId extraction");
  assert(cover.unitCode?.value === "4003", "expected unitCode extraction");
  assert(cover.assignmentCode?.value.toUpperCase() === "A1", "expected assignmentCode extraction");
  assert(Boolean(cover.submissionDate?.value), "expected submissionDate extraction");
  assert(cover.declarationPresent?.value === true, "expected declaration detection");
  assert(Number(cover.confidence) > 0.5, "expected positive cover confidence");
  assert(isCoverMetadataReady(cover) === true, "expected cover metadata readiness true");

  console.log("cover metadata extraction tests passed.");
}

run();
