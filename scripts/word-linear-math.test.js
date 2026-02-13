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

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function run() {
  const { convertWordLinearToLatex } = loadTsModule("lib/math/wordLinearToLatex.ts");

  assertEq(convertWordLinearToLatex("v=5e^-0.2t"), "v=5e^{-0.2t}", "exp");
  assertEq(convertWordLinearToLatex("log_e(3t)"), "\\log_{e}(3t)", "log");
  assertEq(convertWordLinearToLatex("sin(3t^2+2t-1)"), "\\sin(3t^2+2t-1)", "sin");
  assertEq(convertWordLinearToLatex("sqrt(x+1)"), "\\sqrt{x+1}", "sqrt");
  assertEq(convertWordLinearToLatex("(a+b)/(c+d)"), "\\frac{a+b}{c+d}", "fraction");

  console.log("word linear math tests passed.");
}

run();

