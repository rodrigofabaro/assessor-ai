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
  const { extractBrief, debugBriefExtraction } = loadTsModule("lib/extractors/brief.ts");

  const page1 = [
    "Assignment 1 of 1",
    "Task 1",
    "Write a report on production planning and implementation.",
    "Relevant learning outcomes and assessment criteria",
    "LO1 Explain the role and purpose of production engineering and its relationship with the other elements of a manufacturing system.",
    "P1 Illustrate multiple elements of a modern manufacturing system.",
    "P2 Explain the role of the production engineer within a manufacturing system.",
  ].join("\n");

  const page2 = [
    "LO2 Apply project planning and forecasting methods to engineering practice.",
    "P3 Produce a project plan using suitable scheduling methods.",
    "M1 Assess feasibility choices using an appropriate decision matrix.",
  ].join("\n");

  const page3 = [
    "LO3 Evaluate legislation, ethics and environmental considerations for engineering projects.",
    "P4 Describe relevant legislation and standards.",
    "D1 Critically evaluate the impact of ethical decisions on project outcomes.",
  ].join("\n");

  const page4 = [
    "Sources of information",
    "Pearson references and further reading.",
  ].join("\n");

  const text = [page1, page2, page3, page4].join("\f");

  const brief = extractBrief(text, "u4004-a1.pdf");
  const loHeaders = Array.isArray(brief.loHeaders) ? brief.loHeaders.map((v) => String(v)) : [];
  const criteria = Array.isArray(brief.criteriaRefs) ? brief.criteriaRefs.map((v) => String(v).toUpperCase()) : [];

  assert(loHeaders.some((v) => /^LO1:\s+Explain the role and purpose of production engineering/i.test(v)), "expected LO1 description to remain intact");
  assert(loHeaders.some((v) => /^LO2:\s+Apply project planning and forecasting methods/i.test(v)), "expected LO2 header to be extracted");
  assert(loHeaders.some((v) => /^LO3:\s+Evaluate legislation, ethics and environmental considerations/i.test(v)), "expected LO3 header to be extracted");

  assert(criteria.includes("P1"), "expected criteria P1");
  assert(criteria.includes("P2"), "expected criteria P2");
  assert(criteria.includes("P3"), "expected criteria P3");
  assert(criteria.includes("P4"), "expected criteria P4");
  assert(criteria.includes("M1"), "expected criteria M1");
  assert(criteria.includes("D1"), "expected criteria D1");

  const debug = debugBriefExtraction(text);
  const criteriaPages = Array.isArray(debug?.criteriaPages) ? debug.criteriaPages : [];
  assert(criteriaPages.includes(3), "expected criteria region to include third criteria page");

  const noisyCriteriaPage = [
    "Relevant Learning Outcomes and Assessment Criteria",
    "Pass Merit Distinction",
    "LO1",
    "Select a project that will provide a solution to an identified engineering/manufacturing problem.",
    "L01",
    "P1 Select an appropriate project.",
    "LO2",
    "Conduct planned project activities to generate outcomes which provide a solution to the identified engineering problem.",
    "L02",
    "[[EQ:p10-eq1]]",
    "P3 Conduct project activities.",
    "M2 Explore alternative methods.",
    "L03",
    "Produce a project report analysing the outcomes of each of the project processes and stages.",
    "L03 & L4",
    "[[EQ:p10-eq2]]",
    "P4 Produce a project report covering each stage.",
    "M4 Analyse own behaviours.",
    "L04",
    "Present the project report drawing conclusions on the outcomes of the project.",
    "D3 Critically analyse outcomes.",
  ].join("\n");
  const noisyText = [
    "Assignment 1 of 1",
    "Task 1",
    "Produce project documentation.",
    noisyCriteriaPage,
  ].join("\f");
  const noisyBrief = extractBrief(noisyText, "u4004-a1-noisy.pdf");
  const noisyHeaders = Array.isArray(noisyBrief.loHeaders) ? noisyBrief.loHeaders.map((v) => String(v)) : [];
  const noisyCriteria = Array.isArray(noisyBrief.criteriaRefs) ? noisyBrief.criteriaRefs.map((v) => String(v).toUpperCase()) : [];
  assert(noisyHeaders.some((v) => /^LO1:\s+Select a project that will provide a solution/i.test(v)), "expected LO1 from noisy page");
  assert(noisyHeaders.some((v) => /^LO2:\s+Conduct planned project activities/i.test(v)), "expected LO2 from noisy page");
  assert(noisyHeaders.some((v) => /^LO3:\s+Produce a project report analysing the outcomes/i.test(v)), "expected LO3 from noisy page");
  assert(noisyHeaders.some((v) => /^LO4:\s+Present the project report drawing conclusions/i.test(v)), "expected LO4 from noisy page");
  assert(!noisyHeaders.some((v) => /\[\[EQ:/i.test(v)), "expected LO headers to strip equation tokens");
  assert(!noisyHeaders.some((v) => /\bL0\d\b/i.test(v)), "expected LO headers to strip LO alias residue");
  assert(noisyCriteria.includes("M3"), "expected merit sequence gap inference to add M3 when M2 and M4 are present");

  console.log("brief LO extraction regression tests passed.");
}

run();
