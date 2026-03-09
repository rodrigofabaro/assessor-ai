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

function scopedHelper() {
  return {
    getRequestOrganizationId: async () => "org_active",
    addOrganizationReadScope: (where, organizationId) => {
      assert(organizationId === "org_active", "expected IV route to use active org");
      return { scoped: true, where, organizationId };
    },
  };
}

async function testGenerateFromSubmissionScopesSubmission() {
  const { POST } = loadTsModule("app/api/admin/iv-ad/generate-from-submission/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        submission: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected IV generate-from-submission to use scoped where");
            assert(args.where.where.id === "sub_1", "expected IV generate-from-submission to scope submission id");
            return null;
          },
        },
      },
    },
    "@/lib/api/errors": {
      makeRequestId: () => "req_test",
      apiError: ({ status, code }) => ({ status, body: { error: code } }),
    },
    "@/lib/admin/permissions": { isAdminMutationAllowed: async () => ({ ok: true }) },
    "@/lib/iv-ad/analysis": {
      extractIvAdPreviewFromMarkedPdfBuffer: async () => ({ extractedText: "", extractedGradeGuess: null, extractedKeyNotesGuess: "", pageCount: 0 }),
      buildIvAdNarrative: () => ({ generalComments: "", actionRequired: "" }),
      normalizeGrade: (v) => v,
    },
    "@/lib/iv-ad/docxFiller": { fillIvAdTemplateDocx: async () => ({ buffer: Buffer.from(""), tableShape: null }) },
    "@/lib/iv-ad/storage": { writeIvAdBuffer: async () => ({ storagePath: "storage/iv.docx" }) },
    "@/lib/iv-ad/aiReview": { runIvAdAiReview: async () => ({ ok: false, reason: "DISABLED" }) },
    "@/lib/storage/provider": { resolveStorageAbsolutePathAsync: async () => null },
    "fs/promises": { readFile: async () => Buffer.from("") },
  });

  const res = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submissionId: "sub_1" }),
    })
  );
  assert(res.status === 404, "expected IV generate-from-submission to reject invisible submission");
}

async function testReviewDraftScopesReferenceSpec() {
  const { POST } = loadTsModule("app/api/iv-ad/review-draft/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected IV review-draft to use scoped where");
            assert(args.where.where.id === "doc_spec", "expected IV review-draft to scope reference spec id");
            return null;
          },
        },
      },
    },
    "@/lib/api/errors": {
      makeRequestId: () => "req_test",
      apiError: ({ status, code }) => ({ status, body: { error: code } }),
    },
    "@/lib/admin/permissions": { isAdminMutationAllowed: async () => ({ ok: true }) },
    "@/lib/ops/eventLog": { appendOpsEvent: () => null },
    "@/lib/iv-ad/reviewDraft": {
      parseIvAdReviewDraftRequest: (input) => ({ success: true, data: input }),
      runIvAdReviewDraft: async () => ({ ok: true, draft: { model: "m", confidence: 0.8, warnings: [], evidenceSnippets: [] } }),
    },
    "@/lib/iv-ad/analysis": {
      extractIvAdPreviewFromMarkedPdfBuffer: async () => ({ extractedText: "text", extractedGradeGuess: "PASS" }),
      normalizeGrade: (v) => v,
    },
    "@/lib/storage/provider": { resolveStorageAbsolutePathAsync: async () => null },
    "fs/promises": { readFile: async () => Buffer.from("") },
  });

  const formData = new FormData();
  formData.set("markedPdf", new File([Buffer.from("pdf")], "marked.pdf", { type: "application/pdf" }));
  formData.set("referenceSpecId", "doc_spec");
  formData.set("studentName", "Alex Student");
  formData.set("programmeTitle", "Programme");
  formData.set("unitCodeTitle", "4001 - Unit");
  formData.set("assignmentTitle", "Assignment");
  formData.set("assessorName", "Assessor");
  formData.set("internalVerifierName", "IV");
  formData.set("finalGrade", "PASS");
  formData.set("keyNotes", "notes");

  const res = await POST(new Request("http://localhost", { method: "POST", body: formData }));
  assert(res.status === 400, "expected IV review-draft to reject invisible reference spec");
}

async function testIvBackfillScopesBriefAndAttachment() {
  let firstLookup = true;
  const { POST } = loadTsModule("app/api/briefs/[briefId]/iv/[ivId]/backfill-summary/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        assignmentBrief: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected IV backfill to scope brief id");
            assert(args.where.where.id === "brief_1", "expected IV backfill to scope brief id lookup");
            return {
              id: "brief_1",
              briefDocumentId: "doc_brief",
              briefDocument: {
                id: "doc_brief",
                sourceMeta: {
                  ivRecords: [
                    {
                      id: "iv_1",
                      academicYear: "2025-26",
                      attachment: { documentId: "doc_attach", originalFilename: "evidence.docx" },
                    },
                  ],
                },
              },
            };
          },
        },
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected IV backfill to scope attachment doc id");
            assert(args.where.where.id === "doc_attach", "expected IV backfill to scope attachment doc id lookup");
            return null;
          },
          update: async () => null,
        },
      },
    },
    "@/lib/extraction/storage/resolveStoredFile": { resolveStoredFile: async () => ({ ok: false, path: null }) },
    "@/lib/iv/evidenceSummary": { extractIvSummaryFromDocxBuffer: async () => null },
    fs: { readFileSync: () => Buffer.from("") },
    path: require("path"),
  });

  const res = await POST(new Request("http://localhost"), {
    params: Promise.resolve({ briefId: "brief_1", ivId: "iv_1" }),
  });
  assert(res.status === 404, "expected IV backfill to reject invisible attachment document");
}

async function main() {
  await testGenerateFromSubmissionScopesSubmission();
  await testReviewDraftScopesReferenceSpec();
  await testIvBackfillScopesBriefAndAttachment();
  console.log("organization scope IV boundary tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
