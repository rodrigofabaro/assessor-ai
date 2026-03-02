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
  const { normalizeSymbolArtifacts } = loadTsModule("lib/extraction/normalize/symbols.ts");

  const sample =
    "The boiler runs at 100 ° CC and 30 ° C.\n" +
    "Resistance is 47Ω and current is 5µA.\n" +
    "Torque is 12 Nm and angle is 휃 with phase 휋/4.\n" +
    "Gain uses 퐶퐶 artefact and micro 휇s timing.";

  const out = normalizeSymbolArtifacts(sample, { normalizeNewlines: true, collapseWhitespace: true });

  assert(/100 °C/.test(out), "expected Celsius OCR artifact normalization");
  assert(/30 °C/.test(out), "expected degree+unit spacing normalization");
  assert(/47 Ω/.test(out), "expected ohm symbol normalization");
  assert(/5 μA/.test(out), "expected micro symbol normalization");
  assert(/12 N·m/.test(out), "expected torque unit normalization");
  assert(/θ/.test(out), "expected theta greek normalization");
  assert(/π\/4/.test(out), "expected pi greek normalization");
  assert(!/° CC/.test(out), "expected no unresolved ° CC artifact");
  assert(!/Ω/.test(out), "expected no ohm alt symbol left");
  assert(!/µ/.test(out), "expected no micro alt symbol left");

  console.log("symbol normalization tests passed.");
}

run();

