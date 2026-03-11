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
  const { parseIvAdReviewDraftRequest, parseIvAdReviewDraftModelOutput } = loadTsModule("lib/iv-ad/reviewDraft.ts");
  const reviewDraftSource = fs.readFileSync(path.resolve("lib/iv-ad/reviewDraft.ts"), "utf8");

  const validRequest = parseIvAdReviewDraftRequest({
    studentName: "Student A",
    programmeTitle: "BTEC Level 3 Engineering",
    unitCodeTitle: "45 - Industrial Systems",
    assignmentTitle: "Assignment 1",
    assessorName: "Assessor A",
    internalVerifierName: "IV A",
    finalGrade: "PASS",
    keyNotes: "Good structure but weak criterion links.",
    markedExtractedText: "Marked text evidence from submission.",
    assessmentFeedbackText: "Feedback says improve criterion references.",
    specExtractedText: "Spec context text.",
  });
  assert(validRequest.success, "expected valid review-draft request to pass");

  const invalidRequest = parseIvAdReviewDraftRequest({
    studentName: "",
    programmeTitle: "Programme",
    unitCodeTitle: "Unit",
    assignmentTitle: "Assignment",
    assessorName: "Assessor",
    internalVerifierName: "IV",
    finalGrade: "PASS",
    markedExtractedText: "",
  });
  assert(!invalidRequest.success, "expected empty required fields to fail request validation");

  const validModelOutput = parseIvAdReviewDraftModelOutput(
    {
      assessmentDecisionCheck: "Decision is mostly aligned with evidence for PASS.",
      feedbackComplianceCheck: "Feedback is mostly specific but misses one criterion reference.",
      criteriaLinkingCheck: "Criterion links are present for pass criteria and weak for merit criteria.",
      academicIntegrityCheck: "No obvious integrity concern identified from provided text.",
      generalComments: "Assessor decision is acceptable with minor evidence-link improvements needed.",
      actionRequired: "Add explicit criterion references in final feedback for each judgement.",
      feedbackReviewReport: "1. General weaknesses in the current notes\n- Notes are vague.\n\n2. How the notes should improve in general\n- Make them criterion-led.\n\n3. Holistic weaknesses in the overall feedback approach\n- Final feedback is fragmented.\n\n4. Improved tutor margin notes\n| Original note | Problem with note | Improved version |\n| --- | --- | --- |\n| Add more detail | Vague | Explain which evidence is missing and why it matters. |\n\n5. Improved final feedback\nStrengths, gaps, next steps, and overall summary.\n\n6. Feedback quality rules for future assessments\n- Use VASCR-led wording.",
      warnings: ["Evidence for M criteria is thin in the provided excerpts."],
      confidence: 0.78,
      evidenceSnippets: [
        { source: "submission", excerpt: "Pass criteria addressed in section 2 with examples." },
        { source: "assessment", excerpt: "Feedback notes lack of explicit M1 linkage." },
      ],
    },
    "gpt-4o-mini"
  );
  assert(validModelOutput.success, "expected valid model output to pass schema validation");
  assert(validModelOutput.data.provider === "openai", "expected provider to be set to openai");
  assert(validModelOutput.data.model === "gpt-4o-mini", "expected model metadata passthrough");

  const invalidModelOutput = parseIvAdReviewDraftModelOutput(
    {
      assessmentDecisionCheck: "ok",
      feedbackComplianceCheck: "ok",
      criteriaLinkingCheck: "ok",
      academicIntegrityCheck: "ok",
      generalComments: "ok",
      actionRequired: "ok",
      feedbackReviewReport: "",
      warnings: [],
      confidence: 1.2,
      evidenceSnippets: [],
    },
    "gpt-4o-mini"
  );
  assert(!invalidModelOutput.success, "expected invalid model output to fail schema validation");
  assert(reviewDraftSource.includes("feedbackReviewReport"), "expected review-draft schema to require feedbackReviewReport");
  assert(
    reviewDraftSource.includes("General weaknesses in the current notes"),
    "expected review-draft prompt to include structured tutor-feedback review headings"
  );
  assert(reviewDraftSource.includes("VASCR"), "expected review-draft prompt to mention VASCR guidance");

  console.log("iv-ad review draft schema tests passed.");
}

run();
