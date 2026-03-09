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
    NextResponse: class MockNextResponse {
      constructor(body, init = {}) {
        this.body = body;
        this.status = Number(init.status || 200);
        this.headers = init.headers || {};
      }
      static json(body, init = {}) {
        return { status: Number(init.status || 200), body, headers: init.headers || {} };
      }
    },
  };
}

function scopedHelper() {
  return {
    getRequestOrganizationId: async () => "org_active",
    addOrganizationReadScope: (where, organizationId) => {
      assert(organizationId === "org_active", "expected route to use active org");
      return { scoped: true, where, organizationId };
    },
  };
}

async function testSubmissionFileScopesLookup() {
  const { GET } = loadTsModule("app/api/submissions/[submissionId]/file/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        submission: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected submission file to use scoped where");
            assert(args.where.where.id === "sub_1", "expected submission file to scope submission id");
            return null;
          },
        },
      },
    },
    "@/lib/storage/provider": { resolveStorageAbsolutePathAsync: async () => null },
    fs: { existsSync: () => false, readFileSync: () => Buffer.from("") },
    path: require("path"),
  });

  const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ submissionId: "sub_1" }) });
  assert(res.status === 404, "expected submission file to reject invisible submission");
}

async function testSubmissionMarkedFileScopesLookup() {
  const { GET } = loadTsModule("app/api/submissions/[submissionId]/marked-file/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        submission: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected marked-file to use scoped where");
            assert(args.where.where.id === "sub_1", "expected marked-file to scope submission id");
            return null;
          },
        },
      },
    },
    "@/lib/storage/provider": { resolveStorageAbsolutePathAsync: async () => null },
    "node:fs": { existsSync: () => false, readFileSync: () => Buffer.from("") },
    "node:path": require("node:path"),
  });

  const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ submissionId: "sub_1" }) });
  assert(res.status === 404, "expected marked-file to reject invisible submission");
}

async function testSubmissionExtractScopesLookup() {
  const { POST } = loadTsModule("app/api/submissions/[submissionId]/extract/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        submission: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected submission extract to use scoped where");
            assert(args.where.where.id === "sub_1", "expected submission extract to scope submission id");
            return null;
          },
        },
      },
    },
    "@/lib/extraction": { extractFile: async () => ({}) },
    "@/lib/api/errors": {
      makeRequestId: () => "req_test",
      apiError: ({ status, code }) => ({ status, body: { error: code } }),
    },
    "@/lib/ocr/openaiPdfOcr": { ocrPdfWithOpenAi: async () => ({ ok: false, warnings: [] }) },
    "@/lib/submissions/coverMetadata": {
      extractCoverMetadataFromPages: () => ({}),
      isCoverMetadataReady: () => false,
    },
    "@/lib/submissions/autoGrade": { triggerAutoGradeIfAutoReady: async () => null },
    "@/lib/turnitin/service": { maybeAutoSendTurnitinForSubmission: async () => null },
    "@/lib/extraction/normalize/symbols": { normalizeSymbolArtifacts: (v) => v },
    "@/lib/auth/inviteEmail": { sendOpsAlertEmail: async () => null },
  });

  const res = await POST(new Request("http://localhost/api/submissions/sub_1/extract"), {
    params: Promise.resolve({ submissionId: "sub_1" }),
  });
  assert(res.status === 404, "expected submission extract to reject invisible submission");
}

async function testSubmissionGradeScopesLookup() {
  const { POST } = loadTsModule("app/api/submissions/[submissionId]/grade/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        submission: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected submission grade to use scoped where");
            assert(args.where.where.id === "sub_1", "expected submission grade to scope submission id");
            return null;
          },
        },
      },
    },
    "@/lib/grading/config": { readGradingConfig: () => ({}), resolveFeedbackTemplate: () => ({ template: "default", scope: "default", userId: null }) },
    "@/lib/grading/markedPdf": { createMarkedPdf: async () => null },
    "@/lib/openai/usageLog": { recordOpenAiUsage: () => null },
    "@/lib/api/errors": {
      makeRequestId: () => "req_test",
      apiError: ({ status, code }) => ({ status, body: { error: code } }),
    },
    "@/lib/grading/decisionValidation": { validateGradeDecision: () => ({ ok: true }) },
    "@/lib/grading/assessmentResult": { buildStructuredGradingV2: () => ({}) },
    "@/lib/grading/extractionQualityGate": { evaluateExtractionReadiness: () => ({ ok: true }) },
    "@/lib/grading/feedbackPersonalization": {
      extractFirstNameForFeedback: () => "Student",
      personalizeFeedbackSummary: (v) => v,
    },
    "@/lib/grading/feedbackDocument": { renderFeedbackTemplate: () => "feedback" },
    "@/lib/grading/pageNotes": {
      buildPageNotesFromCriterionChecks: () => [],
      pageNoteTextHasIncompleteAdvice: () => false,
      repairPageNoteTextAdvice: (v) => v,
    },
    "@/lib/grading/pageNoteSectionMaps": { resolvePageNoteBannedKeywords: () => [], pickTonePhrase: undefined },
    "@/lib/grading/feedbackClaimLint": { lintOverallFeedbackClaims: ({ text }) => ({ text, changed: false, changedLines: 0 }) },
    "@/lib/grading/feedbackPearsonPolicyLint": { lintOverallFeedbackPearsonPolicy: ({ text }) => ({ text, changed: false, changedLines: 0 }) },
    "@/lib/grading/feedbackVascrPolicy": { enforceFeedbackVascrPolicy: (v) => v },
    "@/lib/grading/feedbackAnnotationPolicy": { enforceFeedbackAnnotationPolicy: (v) => v },
    "@/lib/grading/studentFeedback": {
      sanitizeStudentFeedbackBullets: (v) => v,
      sanitizeStudentFeedbackLine: (v) => v,
    },
    "@/lib/admin/appConfig": { getOrCreateAppConfig: async () => ({ activeAuditUser: { isActive: true, fullName: "tester", id: "user_1" } }) },
    "@/lib/openai/client": { fetchOpenAiJson: async () => ({ ok: false, json: {} }), resolveOpenAiApiKey: () => ({ apiKey: "key" }) },
    "@/lib/openai/modelConfig": { readOpenAiModel: () => ({ model: "gpt-4.1-mini" }) },
    "@/lib/openai/responsesParams": { buildResponsesTemperatureParam: () => ({}) },
    "@/lib/ops/eventLog": { appendOpsEvent: () => null },
    "@/lib/admin/permissions": { isAdminMutationAllowed: async () => ({ ok: true }) },
    "@/lib/grading/confidenceScoring": { computeGradingConfidence: () => ({ finalConfidence: 0.8 }) },
    "@/lib/grading/inputStrategy": { chooseGradingInputStrategy: () => ({ mode: "sample", sampledPages: [] }) },
    "@/lib/extraction": { extractFile: async () => ({ pages: [] }) },
    "@/lib/turnitin/service": { maybeAutoDetectAiWritingForSubmission: async () => null },
    "@/lib/notes/toneDatabase": { pickTonePhrase: () => "", resolveToneProfileFromLegacy: () => "balanced" },
    "@/lib/storage/provider": { resolveStorageAbsolutePathAsync: async () => null },
    "@/lib/auth/inviteEmail": { sendOpsAlertEmail: async () => null },
    "node:crypto": require("node:crypto"),
    "node:fs/promises": { readFile: async () => Buffer.from("") },
  });

  const res = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    }),
    { params: Promise.resolve({ submissionId: "sub_1" }) }
  );
  assert(res.status === 404, "expected submission grade to reject invisible submission");
}

async function testSubmissionTriageScopesLookup() {
  const { POST } = loadTsModule("app/api/submissions/[submissionId]/triage/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        submission: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected submission triage to use scoped where");
            assert(args.where.where.id === "sub_1", "expected submission triage to scope submission id");
            return null;
          },
        },
      },
    },
    "@/lib/api/errors": {
      makeRequestId: () => "req_test",
      apiError: ({ status, code }) => ({ status, body: { error: code } }),
    },
    "@/lib/submissions/autoGrade": { triggerAutoGradeIfAutoReady: async () => null },
  });

  const res = await POST(new Request("http://localhost"), { params: { submissionId: "sub_1" } });
  assert(res.status === 404, "expected submission triage to reject invisible submission");
}

async function testChartRecoverScopesLookup() {
  const { POST } = loadTsModule("app/api/reference-documents/[documentId]/chart-recover/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected chart recover to use scoped where");
            assert(args.where.where.id === "doc_1", "expected chart recover to scope document id");
            return null;
          },
        },
      },
    },
    "@/lib/extraction/storage/resolveStoredFile": { resolveStoredFile: async () => ({ ok: false, tried: [] }) },
    "@/lib/ai/hybrid": {
      localVisionJson: async () => ({ ok: false }),
      shouldTryLocal: () => false,
      shouldTryOpenAi: () => false,
    },
    "@/lib/openai/client": {
      fetchOpenAiJson: async () => ({ ok: false, json: {} }),
      resolveOpenAiApiKey: () => ({ apiKey: "" }),
    },
    "@/lib/openai/modelConfig": { readOpenAiModel: () => ({ model: "" }) },
    "@/lib/openai/responsesParams": { buildResponsesTemperatureParam: () => ({}) },
    "@/lib/openai/usageLog": { recordOpenAiUsage: () => null },
    "node:fs/promises": { readFile: async () => Buffer.from("") },
    "node:path": require("node:path"),
    "node:url": require("node:url"),
  });

  const res = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageNumber: 1 }),
    }),
    { params: Promise.resolve({ documentId: "doc_1" }) }
  );
  assert(res.status === 404, "expected chart recover to reject invisible document");
}

async function main() {
  await testSubmissionFileScopesLookup();
  await testSubmissionMarkedFileScopesLookup();
  await testSubmissionExtractScopesLookup();
  await testSubmissionGradeScopesLookup();
  await testSubmissionTriageScopesLookup();
  await testChartRecoverScopesLookup();
  console.log("organization scope submission/reference ops boundary tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
