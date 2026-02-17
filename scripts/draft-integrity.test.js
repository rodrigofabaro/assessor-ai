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
  const { sanitizeBriefDraftArtifacts } = loadTsModule("lib/extraction/brief/draftIntegrity.ts");

  const draft = {
    kind: "BRIEF",
    tasks: [
      {
        n: 2,
        parts: [
          {
            key: "a",
            text: [
              "Wi-Fi Device Performance Data",
              "",
              "Recovered chart data (from uploaded image):",
              "",
              "0 to 25 devices 14",
              "Silicon Chip Failure Rates - The company mass produces silicon chips",
              "Failure Reason Number of Chips",
              "Overheating 24",
              "26 to 50 devices 45",
              "51 to 75 devices 36",
              "76 to 100 devices 24",
            ].join("\n"),
          },
          {
            key: "b",
            text: [
              "Failure Reason Number of Chips",
              "Overheating 24",
              "Voltage Performance 35",
              "[[EQ:p4-eq2]]",
              "",
              "Recovered chart data (from uploaded image):",
              "0 to 10 devices 42",
            ].join("\n"),
          },
        ],
      },
    ],
  };

  const out = sanitizeBriefDraftArtifacts(draft);
  const partA = out.tasks[0].parts[0].text;
  const partB = out.tasks[0].parts[1].text;

  assert(/0 to 25 devices 14/.test(partA), "part a should keep chart row 1");
  assert(/26 to 50 devices 45/.test(partA), "part a should keep chart row 2");
  assert(!/Failure Reason Number of Chips/i.test(partA), "part a should remove leaked failure table header");
  assert(!/Overheating 24/i.test(partA), "part a should remove leaked failure table row");

  assert(/Failure Reason Number of Chips/i.test(partB), "part b should keep failure table header");
  assert(/Voltage Performance 35/i.test(partB), "part b should keep failure table rows");
  assert(!/\[\[EQ:[^\]]+\]\]/.test(partB), "part b should strip equation tokens");
  assert(!/Recovered chart data \(from uploaded image\):/i.test(partB), "part b should remove chart recovery block");

  console.log("draft integrity tests passed.");
}

run();

