#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

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
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function loadTsModule(filePath, mocks = {}) {
  const absPath = path.resolve(filePath);
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
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    if (request.startsWith(".")) {
      const resolved = resolveTsLike(path.resolve(dirname, request));
      if (resolved) return loadTsModule(resolved, mocks);
    }
    if (request.startsWith("@/")) {
      const resolved = resolveTsLike(path.resolve(process.cwd(), request.slice(2)));
      if (resolved) return loadTsModule(resolved, mocks);
    }
    return require(request);
  };

  const wrapped = new Function("require", "module", "exports", compiled);
  wrapped(localRequire, mod, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeParsedSpec(loDescription, essentialContent) {
  return {
    kind: "SPEC",
    parserVersion: "spec-v2",
    unit: { unitCode: "64", unitTitle: "Thermofluids" },
    learningOutcomes: [
      {
        loCode: "LO3",
        description: loDescription,
        essentialContent,
        criteria: [
          { acCode: "P7", gradeBand: "PASS", description: "Illustrate the properties of viscosity in fluids" },
          { acCode: "P8", gradeBand: "PASS", description: "Explore three viscosity measurement techniques" },
          { acCode: "M3", gradeBand: "MERIT", description: "Evaluate the effects of shear force on Newtonian and non-Newtonian fluids" },
          { acCode: "D3", gradeBand: "DISTINCTION", description: "Compare the results of a viscosity test on a Newtonian fluid with that which is given on a data sheet and explain any discrepancies" },
        ],
      },
    ],
  };
}

async function testFallbackDoesNotOverrideCleanerLearningOutcomeDescriptions() {
  const cleanPrimary = makeParsedSpec(
    "Illustrate the effects of viscosity in fluids",
    "Viscosity in fluids: shear stress, shear rate, dynamic viscosity, kinematic viscosity",
  );
  const noisyFallback = makeParsedSpec(
    "Illustrate the effects of viscosity in fluids Viscosity in fluids: shear stress, shear rate, dynamic viscosity, kinematic viscosity Newtonian fluids and non-Newtonian fluids",
    "Illustrate the effects of viscosity in fluids Viscosity in fluids: shear stress, shear rate, dynamic viscosity, kinematic viscosity Newtonian fluids and non-Newtonian fluids",
  );

  const { extractReferenceDocument } = loadTsModule("lib/extraction/index.ts", {
    "fs/promises": {
      readFile: async () => Buffer.from("pdf"),
    },
    "pdf-parse": async () => ({ text: "FALLBACK_TEXT" }),
    "@/lib/extraction/text/pdfToText": {
      pdfToText: async () => ({ text: "PRIMARY_TEXT", pageCount: 6, equations: [] }),
    },
    "@/lib/extraction/parsers/specParser": {
      parseSpec: (text) => (String(text).includes("FALLBACK") ? noisyFallback : cleanPrimary),
    },
    "@/lib/extractors/brief": {
      extractBrief: () => {
        throw new Error("brief extractor should not run in SPEC test");
      },
    },
    "@/lib/openai/briefMathCleanup": {
      cleanupBriefTasksMathWithOpenAi: async () => {
        throw new Error("brief cleanup should not run in SPEC test");
      },
    },
    "@/lib/openai/briefStructureRecovery": {
      recoverBriefStructureWithAi: async () => {
        throw new Error("brief recovery should not run in SPEC test");
      },
    },
  });

  const result = await extractReferenceDocument({
    type: "SPEC",
    filePath: "fake.pdf",
    docTitleFallback: "u64 spec.pdf",
  });

  assert(
    result.extractedJson.learningOutcomes[0].description === cleanPrimary.learningOutcomes[0].description,
    "expected cleaner primary LO description to beat noisy fallback parse"
  );
  assert(
    !(result.warnings || []).some((warning) => /fallback selected/i.test(String(warning))),
    "expected noisy fallback parse not to be selected"
  );
}

async function main() {
  await testFallbackDoesNotOverrideCleanerLearningOutcomeDescriptions();
  console.log("spec fallback quality contract tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
