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
  const { computeGradingConfidence } = loadTsModule("lib/grading/confidenceScoring.ts");

  const highSignal = computeGradingConfidence({
    modelConfidence: 0.88,
    extractionConfidence: 0.91,
    extractionMode: "FULL",
    modalityMissingCount: 0,
    readinessChecklist: {
      extractionCompleteness: true,
      studentLinked: true,
      assignmentLinked: true,
      lockedReferencesAvailable: true,
    },
    criteriaAlignmentOverlapRatio: 1,
    criteriaAlignmentMismatchCount: 0,
    criterionChecks: Array.from({ length: 6 }).map((_, i) => ({
      code: `P${i + 1}`,
      decision: "ACHIEVED",
      confidence: 0.84,
      evidence: [{ page: i + 1, quote: "clear cited evidence" }, { page: i + 1, visualDescription: "annotated diagram" }],
    })),
    evidenceDensitySummary: {
      criteriaCount: 6,
      totalCitations: 12,
      criteriaWithoutEvidence: 0,
    },
    modalityMissingCap: 0.65,
    bandCapWasCapped: false,
  });
  assert(highSignal.finalConfidence > 0.8, `expected high confidence > 0.8, got ${highSignal.finalConfidence}`);
  assert(highSignal.capsApplied.length === 0, "expected no caps in high-signal scenario");

  const constrained = computeGradingConfidence({
    modelConfidence: 0.93,
    extractionConfidence: 0.86,
    extractionMode: "FULL",
    modalityMissingCount: 3,
    readinessChecklist: {
      extractionCompleteness: true,
      studentLinked: true,
      assignmentLinked: true,
      lockedReferencesAvailable: true,
    },
    criteriaAlignmentOverlapRatio: 1,
    criteriaAlignmentMismatchCount: 0,
    criterionChecks: Array.from({ length: 6 }).map((_, i) => ({
      decision: "ACHIEVED",
      confidence: 0.89,
      evidence: [{ page: i + 1, quote: "well-cited evidence" }],
    })),
    evidenceDensitySummary: {
      criteriaCount: 6,
      totalCitations: 8,
      criteriaWithoutEvidence: 0,
    },
    modalityMissingCap: 0.65,
    bandCapWasCapped: false,
  });
  assert(constrained.finalConfidence <= 0.65, `expected confidence at/below modality cap, got ${constrained.finalConfidence}`);
  assert(
    constrained.capsApplied.some((c) => c.name === "modality_missing_cap"),
    "expected modality_missing_cap to be applied"
  );

  const lowExtraction = computeGradingConfidence({
    modelConfidence: 0.79,
    extractionConfidence: 0.61,
    extractionMode: "COVER_ONLY",
    modalityMissingCount: 0,
    readinessChecklist: {
      extractionCompleteness: true,
      studentLinked: true,
      assignmentLinked: false,
      lockedReferencesAvailable: true,
    },
    criteriaAlignmentOverlapRatio: 0.9,
    criteriaAlignmentMismatchCount: 2,
    criterionChecks: [
      { decision: "ACHIEVED", confidence: 0.72, evidence: [{ page: 2, quote: "evidence" }] },
      { decision: "UNCLEAR", confidence: 0.5, evidence: [] },
      { decision: "NOT_ACHIEVED", confidence: 0.56, evidence: [{ page: 3, quote: "gap noted" }] },
      { decision: "UNCLEAR", confidence: 0.49, evidence: [] },
    ],
    evidenceDensitySummary: {
      criteriaCount: 4,
      totalCitations: 2,
      criteriaWithoutEvidence: 2,
    },
    modalityMissingCap: 0.65,
    bandCapWasCapped: false,
  });
  const sameSignalsHighExtraction = computeGradingConfidence({
    modelConfidence: 0.79,
    extractionConfidence: 0.95,
    extractionMode: "FULL",
    modalityMissingCount: 0,
    readinessChecklist: {
      extractionCompleteness: true,
      studentLinked: true,
      assignmentLinked: false,
      lockedReferencesAvailable: true,
    },
    criteriaAlignmentOverlapRatio: 0.9,
    criteriaAlignmentMismatchCount: 2,
    criterionChecks: [
      { decision: "ACHIEVED", confidence: 0.72, evidence: [{ page: 2, quote: "evidence" }] },
      { decision: "UNCLEAR", confidence: 0.5, evidence: [] },
      { decision: "NOT_ACHIEVED", confidence: 0.56, evidence: [{ page: 3, quote: "gap noted" }] },
      { decision: "UNCLEAR", confidence: 0.49, evidence: [] },
    ],
    evidenceDensitySummary: {
      criteriaCount: 4,
      totalCitations: 2,
      criteriaWithoutEvidence: 2,
    },
    modalityMissingCap: 0.65,
    bandCapWasCapped: false,
  });
  const sameSignalsMaxExtraction = computeGradingConfidence({
    modelConfidence: 0.79,
    extractionConfidence: 1,
    extractionMode: "FULL",
    modalityMissingCount: 0,
    readinessChecklist: {
      extractionCompleteness: true,
      studentLinked: true,
      assignmentLinked: false,
      lockedReferencesAvailable: true,
    },
    criteriaAlignmentOverlapRatio: 0.9,
    criteriaAlignmentMismatchCount: 2,
    criterionChecks: [
      { decision: "ACHIEVED", confidence: 0.72, evidence: [{ page: 2, quote: "evidence" }] },
      { decision: "UNCLEAR", confidence: 0.5, evidence: [] },
      { decision: "NOT_ACHIEVED", confidence: 0.56, evidence: [{ page: 3, quote: "gap noted" }] },
      { decision: "UNCLEAR", confidence: 0.49, evidence: [] },
    ],
    evidenceDensitySummary: {
      criteriaCount: 4,
      totalCitations: 2,
      criteriaWithoutEvidence: 2,
    },
    modalityMissingCap: 0.65,
    bandCapWasCapped: false,
  });
  assert(
    Number(lowExtraction.penalties.extractionLowPenalty || 0) === 0,
    "expected extractionLowPenalty to remain zero by policy"
  );
  assert(
    Number(lowExtraction.penalties.coverOnlyPenalty || 0) === 0,
    "expected coverOnlyPenalty to remain zero by policy"
  );
  assert(
    !lowExtraction.capsApplied.some((c) => c.name === "extraction_confidence_cap"),
    "expected no extraction confidence cap by policy"
  );
  assert(
    Math.abs(lowExtraction.finalConfidence - sameSignalsHighExtraction.finalConfidence) < 0.001,
    `expected non-max extraction confidence to not change final confidence (${lowExtraction.finalConfidence} vs ${sameSignalsHighExtraction.finalConfidence})`
  );
  assert(
    sameSignalsMaxExtraction.finalConfidence > lowExtraction.finalConfidence,
    `expected max extraction confidence to add bonus (${sameSignalsMaxExtraction.finalConfidence} vs ${lowExtraction.finalConfidence})`
  );
  assert(
    Number(sameSignalsMaxExtraction.bonuses?.extractionHighConfidenceBonus || 0) > 0,
    "expected extractionHighConfidenceBonus when extraction confidence is maximal"
  );

  console.log("grading confidence scoring tests passed.");
}

run();
