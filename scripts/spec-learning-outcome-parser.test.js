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

function sampleSpecText() {
  return [
    "Unit 64: Fluid Mechanics",
    "Learning Outcomes",
    "LO1 Explain the principles of pressure measurement in fluids.",
    "LO2 Investigate flow characteristics in pipe systems.",
    "LO3 Illustrate the effects of viscosity in fluids.",
    "LO4 Analyse hydrostatic and hydrodynamic systems.",
    "",
    "Learning Outcomes and Assessment Criteria",
    "LO3",
    "P7 Illustrate the properties of viscosity in fluids",
    "P8 Explore three viscosity measurement techniques",
    "M3 Evaluate the effects of shear force on Newtonian and non-Newtonian fluids",
    "D3 Compare the results of a viscosity test on a Newtonian fluid with that which is given on a data sheet and explain any discrepancies",
    "LO4",
    "P9 Explain hydrostatic pressure effects.",
  ].join("\n");
}

function sampleSpecWithEssentialContentEcho() {
  return [
    "Unit 4011: Fluid Mechanics",
    "Learning Outcomes",
    "By the end of this unit students will be able to:",
    "LO1 Determine the behavioural characteristics of static fluid systems",
    "LO2 Examine the operating principles and limitations of viscosity measuring devices",
    "LO3 Investigate dynamic fluid parameters of real fluid flow",
    "LO4 Explore the operating principles and efficiencies of hydraulic machines.",
    "",
    "Essential Content",
    "LO3 Investigate dynamic fluid parameters of real fluid flow",
    "Fluid flow theory:",
    "Energy present within a flowing fluid and the formulation of Bernoulli's Equation",
    "Classification of fluid flow using Reynolds numbers",
    "LO4 Explore the operating principles and efficiencies of hydraulic machines",
    "Hydraulic machinery:",
    "Operating principles of different types of water turbine",
    "",
    "Learning Outcomes and Assessment Criteria",
    "LO3",
    "P5 Determine parameters of a flowing fluid using Bernoulli's Equation.",
  ].join("\n");
}

function sampleSpecWhereCriteriaTableHasCleanerLoHeading() {
  return [
    "Unit 64: Thermofluids",
    "Essential Content",
    "LO1 Review industrial thermodynamic systems and their properties",
    "Thermodynamic systems:",
    "Power generation plant",
    "Significance of first law of thermodynamics",
    "",
    "Learning Outcomes and Assessment Criteria",
    "Pass Merit Distinction",
    "LO1 Review industrial thermodynamic systems and their properties",
    "P1 Discuss the operation of industrial thermodynamic systems and their properties",
    "P2 Describe the application of the first law of thermodynamics to industrial systems",
    "LO2 Examine the operation of practical steam and gas turbines plants",
    "P4 Explain the principles of operation of steam turbine plant",
  ].join("\n");
}

function sampleSpecWhereLoHeadingAndCriterionShareLine() {
  return [
    "Unit 64: Thermofluids",
    "Learning Outcomes and Assessment Criteria",
    "LO3 Illustrate the effects of viscosity in fluids D3 Compare the results of a viscosity test on a Newtonian fluid",
    "P7 Illustrate the properties of viscosity in fluids",
  ].join("\n");
}

async function testLoDescriptionDoesNotSwallowCriterionText() {
  const { parseSpec } = loadTsModule("lib/extraction/parsers/specParser/index.ts");
  const parsed = parseSpec(sampleSpecText(), "U64 - Spec.pdf");
  const lo3 = parsed.learningOutcomes.find((row) => row.loCode === "LO3");
  const lo4 = parsed.learningOutcomes.find((row) => row.loCode === "LO4");

  assert(!!lo3, "expected LO3");
  assert(!!lo4, "expected LO4");
  assert(
    lo3.description === "Illustrate the effects of viscosity in fluids.",
    `expected clean LO3 description, got: ${lo3.description}`
  );
  assert(
    !/D3 Compare the results/i.test(lo3.description),
    "expected LO3 description not to include distinction criterion text"
  );
  assert(
    lo4.description === "Analyse hydrostatic and hydrodynamic systems.",
    `expected clean LO4 description, got: ${lo4.description}`
  );
  assert(
    lo3.criteria.some((row) => row.acCode === "D3"),
    "expected D3 to stay attached as a criterion under LO3"
  );
}

async function testLoDescriptionPrefersLearningOutcomesSectionOverEssentialContentEcho() {
  const { parseSpec } = loadTsModule("lib/extraction/parsers/specParser/index.ts");
  const parsed = parseSpec(sampleSpecWithEssentialContentEcho(), "Unit 4011 - Fluid Mechanics.pdf");
  const lo3 = parsed.learningOutcomes.find((row) => row.loCode === "LO3");
  const lo4 = parsed.learningOutcomes.find((row) => row.loCode === "LO4");

  assert(!!lo3, "expected LO3 in essential-content echo sample");
  assert(!!lo4, "expected LO4 in essential-content echo sample");
  assert(
    lo3.description === "Investigate dynamic fluid parameters of real fluid flow",
    `expected clean LO3 description from Learning Outcomes section, got: ${lo3.description}`
  );
  assert(
    lo4.description === "Explore the operating principles and efficiencies of hydraulic machines.",
    `expected clean LO4 description from Learning Outcomes section, got: ${lo4.description}`
  );
  assert(
    !/Fluid flow theory|Hydraulic machinery/i.test(`${lo3.description} ${lo4.description}`),
    "expected essential content body text not to bleed into LO descriptions"
  );
}

async function testLoDescriptionCanRecoverFromCriteriaTableHeading() {
  const { parseSpec } = loadTsModule("lib/extraction/parsers/specParser/index.ts");
  const parsed = parseSpec(sampleSpecWhereCriteriaTableHasCleanerLoHeading(), "u64 spec.pdf");
  const lo1 = parsed.learningOutcomes.find((row) => row.loCode === "LO1");

  assert(!!lo1, "expected LO1 in criteria-table heading sample");
  assert(
    lo1.description === "Review industrial thermodynamic systems and their properties",
    `expected LO1 description from criteria-table heading, got: ${lo1.description}`
  );
  assert(
    !/Thermodynamic systems:|Power generation plant/i.test(lo1.description),
    "expected essential content body text not to bleed into LO1 description"
  );
}

async function testLoDescriptionStripsInlineCriterionTail() {
  const { parseSpec } = loadTsModule("lib/extraction/parsers/specParser/index.ts");
  const parsed = parseSpec(sampleSpecWhereLoHeadingAndCriterionShareLine(), "u64 spec.pdf");
  const lo3 = parsed.learningOutcomes.find((row) => row.loCode === "LO3");

  assert(!!lo3, "expected LO3 in inline-criterion-tail sample");
  assert(
    lo3.description === "Illustrate the effects of viscosity in fluids",
    `expected LO3 description without inline criterion tail, got: ${lo3.description}`
  );
  assert(
    !/\bD3\b|Compare the results/i.test(lo3.description),
    "expected inline distinction criterion text to be stripped from LO description"
  );
}

async function main() {
  await testLoDescriptionDoesNotSwallowCriterionText();
  await testLoDescriptionPrefersLearningOutcomesSectionOverEssentialContentEcho();
  await testLoDescriptionCanRecoverFromCriteriaTableHeading();
  await testLoDescriptionStripsInlineCriterionTail();
  console.log("spec learning outcome parser tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
