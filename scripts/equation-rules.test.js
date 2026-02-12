#!/usr/bin/env node
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

  const mod = { exports: {} };
  const wrapped = new Function("require", "module", "exports", compiled);
  wrapped(require, mod, mod.exports);
  cache.set(absPath, mod.exports);
  return mod.exports;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function run() {
  const { inferEquationLatex } = loadTsModule("lib/extraction/text/pdfToText.ts");

  const cases = [
    {
      label: "fraction",
      lines: ["P=", "V", "2", "R"],
      latex: "P = \\frac{V^2}{R}",
    },
    {
      label: "guitar",
      lines: ["t=2\\pi", "m", "2", "l", "F"],
      latex: "t = 2\\pi \\sqrt{\\frac{m^2 l}{F}}",
    },
    {
      label: "capacitor",
      lines: ["V_C = V_S", "1-e", "-t", "RC"],
      latex: "V_C = V_S\\left(1 - e^{-\\frac{t}{RC}}\\right)",
    },
    {
      label: "signal",
      lines: ["V_S = 8 sin 6\\pi t - \\pi 4", "f=2MHz"],
      latex: "V_S = 8\\sin\\left(6\\pi t - \\frac{\\pi}{4}\\right),\\; f = 2\\,\\mathrm{MHz}",
    },
    {
      label: "cosh",
      lines: ["y=80cosh", "x", "80"],
      latex: "y = 80\\cosh\\left(\\frac{x}{80}\\right)",
    },
  ];

  for (const c of cases) {
    const out = inferEquationLatex(c.lines);
    assertEqual(out.latex, c.latex, c.label);
  }

  const nonFormula = inferEquationLatex(["t = time."]);
  if (typeof nonFormula.latex !== "string" || !nonFormula.latex.includes("time")) {
    throw new Error("non-formula fallback behavior changed unexpectedly");
  }

  console.log("Equation rule tests passed.");
}

run();

