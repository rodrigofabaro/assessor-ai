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
  const { enforceFeedbackAnnotationPolicy } = loadTsModule("lib/grading/feedbackAnnotationPolicy.ts");

  const generic = enforceFeedbackAnnotationPolicy({
    bullets: ["Good work", "Well done", "Nice effort"],
    criterionChecks: [{ code: "M1", decision: "NOT_ACHIEVED" }],
    maxBullets: 4,
  });
  assert(generic.changed, "expected generic bullet policy to apply");
  assert(generic.bullets.length >= 1, "expected fallback bullet when generic bullets are removed");
  assert(
    /remaining criteria|evidence-linked rationale/i.test(generic.bullets.join(" ")),
    "expected fallback assessor-style bullet content"
  );

  const realistic = enforceFeedbackAnnotationPolicy({
    bullets: [
      "Link your explanation to evidence on pages 3-4.",
      "Link your explanation to evidence on pages 3-4.",
      "Clarify the testing method and justify the threshold used.",
    ],
    criterionChecks: [{ code: "P1", decision: "ACHIEVED" }],
    maxBullets: 2,
  });
  assert(realistic.bullets.length === 2, "expected bullet trimming to maxBullets");
  assert(
    realistic.bullets.some((b) => /pages 3-4/i.test(b)),
    "expected evidence-linked bullet to remain"
  );

  const gradeRoute = fs.readFileSync(
    path.join(process.cwd(), "app/api/submissions/[submissionId]/grade/route.ts"),
    "utf8"
  );
  assert(
    gradeRoute.includes("enforceFeedbackAnnotationPolicy"),
    "expected grading route to wire feedback annotation policy"
  );

  console.log("feedback annotation policy tests passed.");
}

run();
