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
  const { chooseGradingInputStrategy } = loadTsModule("lib/grading/inputStrategy.ts");

  const strongPdf = chooseGradingInputStrategy({
    requestedMode: "auto",
    isPdf: true,
    extractionMode: "FULL",
    coverReady: false,
    extractionGateOk: true,
    extractedChars: 5600,
    extractionConfidence: 0.91,
  });
  assert(strongPdf.mode === "EXTRACTED_TEXT", "expected strong extraction to stay in extracted mode");

  const weakPdf = chooseGradingInputStrategy({
    requestedMode: "auto",
    isPdf: true,
    extractionMode: "FULL",
    coverReady: false,
    extractionGateOk: true,
    extractedChars: 700,
    extractionConfidence: 0.62,
  });
  assert(weakPdf.mode === "RAW_PDF_IMAGES", "expected weak extraction to switch to raw mode");

  const forcedRawPdf = chooseGradingInputStrategy({
    requestedMode: "raw",
    isPdf: true,
    extractionMode: "FULL",
    coverReady: false,
    extractionGateOk: false,
    extractedChars: 0,
    extractionConfidence: 0,
  });
  assert(forcedRawPdf.mode === "RAW_PDF_IMAGES", "expected forced raw mode for PDF");

  const forcedRawDocx = chooseGradingInputStrategy({
    requestedMode: "raw",
    isPdf: false,
    extractionMode: "FULL",
    coverReady: false,
    extractionGateOk: true,
    extractedChars: 3000,
    extractionConfidence: 0.9,
  });
  assert(forcedRawDocx.mode === "EXTRACTED_TEXT", "expected non-PDF raw fallback to extracted");

  console.log("grading input strategy tests passed.");
}

run();
