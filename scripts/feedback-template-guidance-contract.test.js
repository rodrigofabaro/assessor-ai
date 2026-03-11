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
  const { renderFeedbackTemplate, extractFeedbackSummaryFromRenderedText } = loadTsModule("lib/grading/feedbackDocument.ts");
  const { buildNaturalHigherGradeGuidance } = loadTsModule("lib/grading/higherGradeFeedback.ts");

  const guidance = buildNaturalHigherGradeGuidance({
    currentGrade: "MERIT",
    targetBand: "DISTINCTION",
    missingCodes: ["D2"],
    reasons: ["D2: The evaluation lacks depth and critical analysis required for distinction."],
  });
  assert(
    /To move from MERIT to DISTINCTION, you still need to achieve D2\./i.test(guidance),
    "expected higher-grade guidance to use natural transition wording"
  );
  assert(
    /At the moment, the gap is that the evaluation lacks depth and critical analysis required for distinction\./i.test(guidance),
    "expected higher-grade guidance to explain the gap smoothly"
  );

  const rendered = renderFeedbackTemplate({
    template: [
      "Improvement priorities",
      "{feedbackBullets}",
      "",
      "Next steps",
      "{higherGradeGuidance}",
    ].join("\n"),
    studentFirstName: "Megan",
    feedbackSummary: "Summary",
    feedbackBullets: [
      "Strengthen the comparison of superheating and regeneration using page-based evidence.",
      "To reach DISTINCTION, achieve D2.",
      "Distinction gap to address: D2: The evaluation lacks depth and critical analysis.",
    ],
    overallGrade: "MERIT",
    assessorName: "Assessor",
    markedDate: "11/03/2026",
    higherGradeGuidance: guidance,
  });
  assert(
    /Strengthen the comparison of superheating and regeneration using page-based evidence\./i.test(rendered),
    "expected non-progression improvement bullet to remain"
  );
  assert(
    !/Improvement priorities[\s\S]*To reach DISTINCTION, achieve D2\./i.test(rendered),
    "expected progression bullet to be removed when higher-grade guidance placeholder is also present"
  );
  assert(
    !/Improvement priorities[\s\S]*Distinction gap to address:/i.test(rendered),
    "expected higher-grade gap bullet to be removed when guidance placeholder is present"
  );
  assert(/Next steps[\s\S]*To move from MERIT to DISTINCTION/i.test(rendered), "expected smooth guidance text in next steps");

  const extractedSummary = extractFeedbackSummaryFromRenderedText([
    "Hello Megan,",
    "",
    "Overall summary",
    "You demonstrate secure understanding of the cycle operation and present the calculations clearly.",
    "",
    "Criteria and evidence",
    "Criteria achieved: M2, P4, P5, P6.",
  ].join("\n"));
  assert(
    extractedSummary === "You demonstrate secure understanding of the cycle operation and present the calculations clearly.",
    "expected rendered feedback summary extractor to return the actual overall summary paragraph"
  );
  const extractedNoisySummary = extractFeedbackSummaryFromRenderedText(
    "Hello Megan, Overall summary Hello Megan, Overall summary You demonstrate secure understanding here. Criteria and evidence Criteria achieved: P1."
  );
  assert(
    extractedNoisySummary === "You demonstrate secure understanding here.",
    "expected rendered feedback summary extractor to remove repeated greeting/heading noise"
  );

  const gradeRoute = fs.readFileSync(path.join(process.cwd(), "app/api/submissions/[submissionId]/grade/route.ts"), "utf8");
  assert(
    gradeRoute.includes("templateHasSplitHigherGradeGuidance"),
    "expected grading route to detect split higher-grade guidance templates"
  );

  console.log("feedback template guidance contract tests passed.");
}

run();
