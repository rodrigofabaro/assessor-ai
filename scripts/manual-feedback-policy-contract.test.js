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

function nextServerMock() {
  return {
    NextResponse: {
      json(body, init = {}) {
        return { status: Number(init.status || 200), body };
      },
    },
  };
}

function deriveBulletsFromFeedbackText(text, maxBullets) {
  const parts = String(text || "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`));
  return parts.slice(0, Math.max(1, Number(maxBullets || 4)));
}

async function testManualFeedbackEditsReapplyQualityPolicies() {
  let updateArgs = null;

  const assessmentRecord = {
    id: "assess_1",
    submissionId: "sub_1",
    overallGrade: "PASS",
    feedbackText: "",
    resultJson: {
      response: {
        feedbackSummary: "Good work.",
        feedbackBullets: ["Good work."],
        criterionChecks: [{ code: "M1", decision: "NOT_ACHIEVED", rationale: "Need clearer evidence links." }],
      },
      referenceContextSnapshot: {
        unit: { unitCode: "4017" },
        assignmentBrief: { assignmentCode: "A1", title: "Manufacturing Review" },
      },
    },
  };

  const { PATCH } = loadTsModule("app/api/submissions/[submissionId]/assessments/[assessmentId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/prisma": {
      prisma: {
        submission: {
          findFirst: async () => ({ id: "sub_1", storagePath: "uploads/submission.pdf" }),
        },
        assessment: {
          findFirst: async () => assessmentRecord,
          update: async (args) => {
            updateArgs = args;
            return {
              id: "assess_1",
              createdAt: new Date("2026-03-11T10:00:00Z"),
              updatedAt: new Date("2026-03-11T10:01:00Z"),
              overallGrade: args.data.overallGrade,
              feedbackText: args.data.feedbackText,
              annotatedPdfPath: args.data.annotatedPdfPath,
              resultJson: args.data.resultJson,
            };
          },
        },
      },
    },
    "@/lib/grading/markedPdf": {
      createMarkedPdf: async () => ({ storagePath: "storage/marked/assess_1.pdf" }),
    },
    "@/lib/grading/feedbackDocument": {
      deriveBulletsFromFeedbackText,
      getDefaultFeedbackTemplate: () => "{feedbackSummary}\n{feedbackBullets}",
      renderFeedbackTemplate: ({ feedbackSummary, feedbackBullets }) =>
        [feedbackSummary, ...(Array.isArray(feedbackBullets) ? feedbackBullets : [])].join("\n"),
      summarizeFeedbackText: (text) => String(text || "").replace(/\s+/g, " ").trim(),
    },
    "@/lib/grading/config": {
      readGradingConfig: () => ({
        config: {
          maxFeedbackBullets: 4,
          pageNotesEnabled: false,
          pageNotesMaxPages: 4,
          pageNotesMaxLinesPerPage: 3,
          pageNotesTone: "supportive",
          pageNotesIncludeCriterionCode: true,
          studentSafeMarkedPdf: false,
        },
      }),
    },
    "@/lib/admin/appConfig": {
      getCurrentAuditActor: async () => "Assessor Example",
    },
    "@/lib/grading/pageNotes": {
      buildPageNotesFromCriterionChecks: () => [],
      extractCriterionChecksFromResultJson: (resultJson) => resultJson?.response?.criterionChecks || [],
    },
    "@/lib/grading/studentFeedback": {
      sanitizeStudentFeedbackText: (value) => String(value || "").trim(),
    },
    "@/lib/auth/requestSession": {
      addOrganizationReadScope: (where) => where,
      getRequestOrganizationId: async () => "org_1",
    },
  });

  const res = await PATCH(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        feedbackText: "M1 achieved.\nGood work.\nSolar work is excellent.\nYou are excellent.",
        studentName: "Alex Carter",
      }),
    }),
    { params: Promise.resolve({ submissionId: "sub_1", assessmentId: "assess_1" }) }
  );

  assert(res.status === 200, "expected manual feedback PATCH success");
  assert(updateArgs, "expected assessment update to run");

  const savedText = String(updateArgs.data.feedbackText || "");
  assert(!/\bM1 achieved\b/i.test(savedText), "expected contradictory criterion claim to be softened");
  assert(!/\bsolar\b/i.test(savedText), "expected Pearson leak terms to be normalized from saved feedback text");
  assert(!/\bYou are excellent\b/i.test(savedText), "expected person-judgement phrasing to be normalized");

  const responsePayload = updateArgs.data.resultJson.response || {};
  assert(
    /mapped evidence/i.test(String(responsePayload.feedbackSummary || "")),
    "expected response payload summary to include VASCR evidence signal"
  );
  assert(
    /To improve the outcome|address remaining criteria/i.test(String(responsePayload.feedbackSummary || "")),
    "expected response payload summary to include VASCR action guidance"
  );
  assert(
    Array.isArray(responsePayload.feedbackBullets) && responsePayload.feedbackBullets.length > 0,
    "expected response payload bullets to be regenerated"
  );
  assert(
    !responsePayload.feedbackBullets.some((line) => /\bgood work\b/i.test(String(line || ""))),
    "expected generic annotation bullets to be removed from regenerated payload"
  );

  const systemNotes = Array.isArray(updateArgs.data.resultJson.systemNotes) ? updateArgs.data.resultJson.systemNotes : [];
  assert(
    systemNotes.some((note) => String(note).startsWith("VASCR summary policy applied")),
    "expected VASCR system note"
  );
  assert(
    systemNotes.some((note) => String(note).startsWith("Feedback annotation policy applied")),
    "expected annotation-policy system note"
  );
  assert(
    systemNotes.some((note) => String(note).startsWith("Overall feedback wording lint softened")),
    "expected feedback-claim lint system note"
  );
  assert(
    systemNotes.some((note) => String(note).startsWith("Pearson feedback style lint normalized")),
    "expected Pearson-style lint system note"
  );
}

async function main() {
  await testManualFeedbackEditsReapplyQualityPolicies();
  console.log("manual feedback policy contract tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
