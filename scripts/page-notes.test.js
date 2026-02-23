#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const cache = new Map();

function resolveTsLike(basePath) {
  const candidates = [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    basePath,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
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
  const { buildPageNotesFromCriterionChecks } = loadTsModule("lib/grading/pageNotes.ts");
  const { criterionAllowedInResolvedSection } = loadTsModule("lib/grading/pageNoteSectionMaps.ts");
  const rows = [
    {
      code: "P6",
      decision: "NOT_ACHIEVED",
      rationale: "Method shown but branch selection is not explicit.",
      evidence: [{ page: 2, quote: "sinusoidal rearrangement and final expression shown" }, { page: 3 }],
    },
    {
      code: "P7",
      decision: "UNCLEAR",
      rationale: "Signed value shown when magnitudes requested.",
      evidence: [{ page: 2, quote: "vector components resolved using cos and sin" }],
    },
    {
      code: "D2",
      decision: "NOT_ACHIEVED",
      rationale: "Screenshots are present but confirmation wording is missing.",
      evidence: [{ page: 4, quote: "software screenshot provided" }],
    },
  ];

  const supportive = buildPageNotesFromCriterionChecks(rows, {
    tone: "supportive",
    maxPages: 2,
    maxLinesPerPage: 10,
    includeCriterionCode: true,
    handwritingLikely: true,
  });
  assert(supportive.length === 2, "maxPages should limit output");
  const note = supportive[0] || { lines: [], items: [] };
  assert((note.lines || []).length >= 2, "note should include useful lines");
  assert(
    (note.lines || []).some((line) => /(strength|improvement|link|presentation|supports|helps evidence)/i.test(line)),
    "note should include human note content"
  );

  const strictNoCode = buildPageNotesFromCriterionChecks(rows, {
    tone: "strict",
    maxPages: 10,
    maxLinesPerPage: 10,
    includeCriterionCode: false,
  });
  const firstBlock = strictNoCode[0]?.lines || [];
  assert(!firstBlock.some((line) => /^Criterion:/i.test(line)), "should remove criterion header when flag disabled");
  assert(
    strictNoCode.some((p) => p.lines.some((l) => /(Strength:|Improvement:|This supports:)/i.test(l))),
    "structured note lines should be present in strict tone"
  );

  const unit4Rows = [
    {
      code: "D1",
      decision: "NOT_ACHIEVED",
      rationale: "Financial planning is described but the evidence link to the criterion is not explicit.",
      evidence: [{ page: 7, quote: "Financial planning budget and cash flow section" }],
    },
    {
      code: "M2",
      decision: "ACHIEVED",
      rationale: "Risk register and mitigation tracking are shown.",
      evidence: [{ page: 9, quote: "Risk register with probability and impact matrix" }],
    },
  ];
  const unit4Notes = buildPageNotesFromCriterionChecks(unit4Rows, {
    tone: "supportive",
    maxPages: 10,
    maxLinesPerPage: 10,
    includeCriterionCode: true,
    context: {
      unitCode: "4004",
      assignmentCode: "A1",
      assignmentTitle: "Managing a Professional Engineering Project",
      criteriaSet: ["D1", "M2"],
    },
  });
  const banned = /\b(solar|pv|wind|hydro|lcoe|renewable|converter|smart grid|simulink)\b/i;
  for (const noteBlock of unit4Notes) {
    const joined = (Array.isArray(noteBlock.items) ? noteBlock.items.map((i) => i.text) : noteBlock.lines).join(" ");
    assert(!banned.test(joined), "Unit 4 note should not contain energy-unit template leakage");
    assert(
      criterionAllowedInResolvedSection({
        code: noteBlock.criterionCode,
        sectionId: noteBlock.sectionId,
        context: { unitCode: "4004", assignmentCode: "A1" },
      }),
      "note should not be attached to a disallowed section for its criterion"
    );
  }
  const itemCounts = unit4Notes.map((n) => (Array.isArray(n.items) ? n.items.length : n.lines.length));
  assert(new Set(itemCounts).size >= 2, "note item count should vary (not forced to one fixed structure)");
  assert(itemCounts.some((c) => c <= 3), "some notes should be short (2-3 items)");

  // Cross-submission guard (not only Unit 4): generic D1 wording may mention renewable systems,
  // but for non-energy contexts it should be replaced with a safe note.
  const nonEnergyNotes = buildPageNotesFromCriterionChecks(
    [
      {
        code: "D1",
        decision: "NOT_ACHIEVED",
        rationale: "Critical evaluation is limited and the evidence link is weak.",
        evidence: [{ page: 5, quote: "Financial planning and milestone review section" }],
      },
    ],
    {
      tone: "supportive",
      maxPages: 5,
      maxLinesPerPage: 10,
      includeCriterionCode: true,
      context: {
        unitCode: "5000",
        assignmentCode: "A1",
        assignmentTitle: "Project Planning Report",
        criteriaSet: ["D1"],
      },
    }
  );
  const nonEnergyJoined = nonEnergyNotes.flatMap((n) => (Array.isArray(n.items) ? n.items.map((i) => i.text) : n.lines)).join(" ");
  assert(!/\brenewable\b/i.test(nonEnergyJoined), "global note guard should block out-of-context renewable wording");

  console.log("page notes tests passed.");
}

run();
