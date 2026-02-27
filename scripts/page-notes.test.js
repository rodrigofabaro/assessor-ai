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
  const { criterionAllowedInResolvedSection, resolvePageNoteSectionCriteriaMap } = loadTsModule("lib/grading/pageNoteSectionMaps.ts");
  const { lintOverallFeedbackClaims } = loadTsModule("lib/grading/feedbackClaimLint.ts");
  const { lintOverallFeedbackPearsonPolicy } = loadTsModule("lib/grading/feedbackPearsonPolicyLint.ts");
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
  assert((note.lines || []).length >= 1, "note should include useful lines");
  assert(
    (note.lines || []).some((line) => /\b(page|evidence|result|requirement|improv|clear|verify)\b/i.test(line)),
    "note should include human note content"
  );
  assert(
    !(note.lines || []).some((line) => /^(Strength|Improvement|Link|Presentation):/i.test(line)),
    "supportive note should avoid legacy label prefixes"
  );
  assert(
    (note.lines || []).length <= 3,
    "supportive note should usually be compact (fluent note style)"
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
    strictNoCode.some((p) => p.lines.some((l) => /\b(requirement|evidence|verify|page)\b/i.test(l))),
    "structured note lines should be present in strict tone"
  );
  assert(
    !strictNoCode.some((p) => p.lines.some((l) => /^(Strength|Improvement|Link|Presentation):/i.test(l))),
    "strict tone should avoid legacy label prefixes"
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
  assert(itemCounts.every((c) => c >= 1), "each note should include at least one item/line");
  assert(itemCounts.some((c) => c <= 3), "some notes should remain compact");
  assert(itemCounts.every((c) => c !== 5), "notes should not be forced into a 5-part structure");
  const unit4Map = resolvePageNoteSectionCriteriaMap({
    unitCode: "4004",
    assignmentType: "project_report",
    assignmentCode: "A1",
  });
  for (const noteBlock of unit4Notes) {
    if (!noteBlock.sectionId || !noteBlock.criterionCode || !unit4Map?.[noteBlock.sectionId]) continue;
    assert(
      unit4Map[noteBlock.sectionId].includes(noteBlock.criterionCode),
      "note criterion should be mapped to the rendered section"
    );
  }
  const allowedKinds = new Set(["praise", "gap", "action", "verification"]);
  for (const noteBlock of unit4Notes) {
    for (const item of Array.isArray(noteBlock.items) ? noteBlock.items : []) {
      assert(allowedKinds.has(item.kind), `note item kind should use global note model kinds: ${item.kind}`);
    }
  }

  const m2GapNote = buildPageNotesFromCriterionChecks(
    [
      {
        code: "M2",
        decision: "NOT_ACHIEVED",
        rationale:
          "M2 not achieved: evidence does not clearly demonstrate an alternative milestone monitoring method beyond Gantt with explicit justified selection.",
        evidence: [{ page: 12, quote: "Gantt chart and milestones review" }],
      },
    ],
    {
      tone: "supportive",
      maxPages: 5,
      maxLinesPerPage: 10,
      includeCriterionCode: true,
      context: {
        unitCode: "4004",
        assignmentCode: "A1",
        assignmentTitle: "Managing a Professional Engineering Project",
        criteriaSet: ["M2"],
      },
    }
  );
  const m2Text = m2GapNote.flatMap((n) => n.lines || []).join(" ");
  assert(/\bGantt chart\b/i.test(m2Text), "M2 supportive note should reference the observed Gantt evidence");
  assert(/\bTo meet M2\b/i.test(m2Text), "M2 supportive note should explicitly state the M2 gap");
  assert(/\bRAG status|critical path|milestone tracker\b/i.test(m2Text), "M2 supportive note should include concrete alternative method examples");

  const genericAchieved = buildPageNotesFromCriterionChecks(
    [
      {
        code: "P1",
        decision: "ACHIEVED",
        rationale: "Evidence is present for this criterion.",
        evidence: [{ page: 2, quote: "Final result shown = 24" }],
      },
    ],
    {
      tone: "supportive",
      maxPages: 5,
      maxLinesPerPage: 10,
      includeCriterionCode: false,
      context: {
        unitCode: "4004",
        assignmentCode: "A1",
        assignmentTitle: "Project Planning Report",
        criteriaSet: ["P1"],
      },
    }
  );
  const genericAchievedText = genericAchieved.flatMap((n) => n.lines || []).join(" ");
  assert(
    !/You have relevant evidence here for this requirement/i.test(genericAchievedText),
    "generic achieved note filler should be suppressed"
  );
  assert(
    !/A short verification line after the final result/i.test(genericAchievedText),
    "generic verification-line wording should not appear by default"
  );
  assert(
    !/\b(add (?:one )?(?:short )?(?:line|sentence)|link to (?:the )?(?:criterion|requirement)|map criteria)\b/i.test(genericAchievedText),
    "incomplete advice phrasing should not appear in final note output"
  );

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
  assert(
    !/\badd one sentence that explicitly connects your evidence to the criterion\b/i.test(nonEnergyJoined),
    "incomplete criterion-link advice should be rewritten into complete guidance"
  );

  const linted = lintOverallFeedbackClaims({
    text: "Criteria achieved: P1, M2.\nM2 achieved clearly through one Gantt chart example.",
    criterionChecks: [
      { code: "P1", decision: "ACHIEVED" },
      { code: "M2", decision: "NOT_ACHIEVED" },
    ],
  });
  assert(linted.changed === true, "feedback claim lint should change contradictory unachieved-criterion claims");
  assert(!/\bM2 achieved\b/i.test(linted.text), "linted feedback should not claim an unachieved criterion was achieved");
  assert(/\bM2 discussed\b/i.test(linted.text), "linted feedback should soften the wording instead");

  const nonProjectM2 = buildPageNotesFromCriterionChecks(
    [
      {
        code: "M2",
        decision: "NOT_ACHIEVED",
        rationale: "M2 not achieved: evaluation of stakeholder communication methods is brief and lacks justification.",
        evidence: [{ page: 6, quote: "Stakeholder communication approach and team updates discussed" }],
      },
    ],
    {
      tone: "supportive",
      maxPages: 5,
      maxLinesPerPage: 10,
      includeCriterionCode: true,
      context: {
        unitCode: "5010",
        assignmentCode: "A2",
        assignmentTitle: "Professional Practice Reflection",
        criteriaSet: ["M2"],
      },
    }
  );
  const nonProjectM2Text = nonProjectM2.flatMap((n) => (Array.isArray(n.items) ? n.items.map((i) => i.text) : n.lines)).join(" ");
  assert(
    !/\b(gantt|critical path|cpm|milestone tracker|rag status)\b/i.test(nonProjectM2Text),
    "non-project M2 notes should not leak project-monitoring wording"
  );
  assert(
    /\b(stakeholder communication methods|justification|improve this page)\b/i.test(nonProjectM2Text),
    "non-project M2 notes should stay grounded in the actual rationale"
  );

  const nonMathD2 = buildPageNotesFromCriterionChecks(
    [
      {
        code: "D2",
        decision: "NOT_ACHIEVED",
        rationale: "D2 not achieved: critical evaluation of implementation choices is present but not fully justified.",
        evidence: [{ page: 14, quote: "Implementation choices and trade-offs are briefly discussed." }],
      },
    ],
    {
      tone: "supportive",
      maxPages: 5,
      maxLinesPerPage: 10,
      includeCriterionCode: true,
      context: {
        unitCode: "6001",
        assignmentCode: "A1",
        assignmentTitle: "Implementation Review",
        criteriaSet: ["D2"],
      },
    }
  );
  const nonMathD2Text = nonMathD2.flatMap((n) => (Array.isArray(n.items) ? n.items.map((i) => i.text) : n.lines)).join(" ");
  assert(
    !/\b(software-to-calculation|analytical value|geogebra|desmos)\b/i.test(nonMathD2Text),
    "non-maths D2 notes should not leak software-calculation confirmation wording"
  );

  const passBandLint = lintOverallFeedbackClaims({
    text: [
      "The work supports merit-level achievements in project monitoring.",
      "To reach distinction, deepen the critical evaluation and add clearer recommendations.",
      "You have achieved Merit-level critical analysis across the report.",
      "Criteria still to evidence clearly: D2.",
      "Final grade: PASS",
    ].join("\n"),
    criterionChecks: [
      { code: "P1", decision: "ACHIEVED" },
      { code: "M2", decision: "NOT_ACHIEVED" },
      { code: "M1", decision: "ACHIEVED" },
      { code: "D2", decision: "NOT_ACHIEVED" },
    ],
    overallGrade: "PASS",
  });
  assert(passBandLint.changed, "PASS feedback lint should soften higher-band overclaims when D criteria remain open");
  assert(
    !/\bachieved Merit-level critical analysis\b/i.test(passBandLint.text),
    "PASS feedback lint should remove strong higher-band achievement wording in the narrative"
  );
  assert(
    !/\bmerit-level achievements\b/i.test(passBandLint.text),
    "PASS feedback lint should soften merit-level achievement noun phrases when Merit criteria remain open"
  );
  assert(
    !/^\s*To reach distinction,/im.test(passBandLint.text),
    "PASS feedback lint should avoid premature narrative distinction lead-ins before the deterministic progression lines"
  );
  assert(
    /Criteria still to evidence clearly: D2\./i.test(passBandLint.text) && /Final grade: PASS/i.test(passBandLint.text),
    "feedback lint should preserve deterministic outcome lines"
  );

  const pearsonStyleLint = lintOverallFeedbackPearsonPolicy({
    text: [
      "Hello Callum,",
      "You are an outstanding student and this is an exceptional submission.",
      "Talk about the result and say why it matters for D2.",
      "Simulink confirms the answer clearly.",
      "Final grade: PASS",
    ].join("\n"),
    overallGrade: "PASS",
    criterionChecks: [
      {
        code: "D2",
        decision: "NOT_ACHIEVED",
        rationale: "Critical evaluation is not yet fully justified.",
        evidence: [{ quote: "Implementation choices and outcomes are discussed." }],
      },
    ],
    context: {
      unitCode: "6001",
      assignmentCode: "A1",
      assignmentTitle: "Implementation Review",
    },
  });
  assert(pearsonStyleLint.changed, "Pearson policy lint should adjust tone/work-focus/spill phrasing");
  assert(
    !/\b(outstanding|exceptional)\b/i.test(pearsonStyleLint.text),
    "PASS feedback should avoid overclaiming tone adjectives"
  );
  assert(
    !/\bYou are an outstanding student\b/i.test(pearsonStyleLint.text),
    "feedback should be softened away from person-judgement phrasing"
  );
  assert(
    /\bexplain\b/i.test(pearsonStyleLint.text) && /\bjustify why\b/i.test(pearsonStyleLint.text),
    "colloquial advice should be normalized toward assessment command verbs"
  );
  assert(
    !/\bSimulink\b/i.test(pearsonStyleLint.text),
    "out-of-context template spill terms should be removed from feedback"
  );
  assert(/Final grade: PASS/i.test(pearsonStyleLint.text), "deterministic lines must remain unchanged");

  console.log("page notes tests passed.");
}

run();
