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
  const { buildBriefFidelityReport, attachBriefTaskProvenance } = loadTsModule(
    "lib/extraction/brief/fidelityReport.ts"
  );

  const source = `
Task 1
Design a test plan for the circuit and explain your approach.

Task 2
Evaluate the resulting chart and justify the failure reasons.
`;

  const draft = {
    kind: "BRIEF",
    tasks: [
      { n: 1, pages: [2], text: "Design a test plan for the circuit and explain your approach." },
      { n: 2, pages: [3], text: "Evaluate the resulting chart and justify the failure reasons.\n[[IMG:p3-t2-img1]]" },
    ],
  };

  const report = buildBriefFidelityReport(draft, source);
  assert(report.ok === true, "expected fidelity report to pass for aligned source/tasks");
  assert(report.blockerCount === 0, "expected zero blockers");
  assert(report.taskProvenance.length === 2, "expected provenance entries for both tasks");

  const enriched = attachBriefTaskProvenance(draft, report);
  assert(!!enriched?.tasks?.[0]?.provenance, "expected provenance attached to task 1");
  assert(Array.isArray(enriched.tasks[0].provenance.pages), "expected provenance pages array");

  const missingTaskDraft = {
    kind: "BRIEF",
    tasks: [
      { n: 1, pages: [1], text: "Task one content only." },
      { n: 3, pages: [2], text: "Extra extracted task without source anchor." },
    ],
  };
  const missingReport = buildBriefFidelityReport(missingTaskDraft, source);
  assert(
    missingReport.issues.some((i) => i.code === "TASK_MISSING_FROM_EXTRACTION" && i.taskNumber === 2),
    "expected blocker for missing Task 2 extraction"
  );
  const missingEnriched = attachBriefTaskProvenance(missingTaskDraft, missingReport);
  const uncitedTask = missingEnriched.tasks.find((t) => Number(t?.n) === 3);
  assert(
    String(uncitedTask?.provenance?.citationStatus || "") === "NEEDS_REVIEW",
    "expected uncited task provenance to be marked NEEDS_REVIEW"
  );
  assert(
    String(uncitedTask?.provenance?.sourceSnippet || "").includes("UNKNOWN / NEEDS_REVIEW"),
    "expected uncited task snippet marker"
  );

  const noImageDraft = {
    kind: "BRIEF",
    tasks: [{ n: 2, pages: [3], text: "Evaluate the chart below and justify the failure reasons." }],
  };
  const noImageReport = buildBriefFidelityReport(noImageDraft, source);
  assert(
    noImageReport.issues.some((i) => i.code === "TASK_VISUAL_REFERENCE_WITHOUT_IMAGE_TOKEN"),
    "expected warning for visual cue without image token"
  );

  console.log("brief fidelity report tests passed.");
}

run();
