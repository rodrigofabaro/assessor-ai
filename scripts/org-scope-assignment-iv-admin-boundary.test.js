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
      assert(organizationId === "org_active", "expected route to use active org");
      return { scoped: true, where, organizationId };
    },
  };
}

async function testAssignmentBindingsGetScopesList() {
  const { GET } = loadTsModule("app/api/assignment-bindings/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        assignment: {
          findMany: async (args) => {
            assert(args.where.scoped === true, "expected assignment-bindings GET to use scoped where");
            return [];
          },
        },
      },
    },
  });

  const res = await GET();
  assert(res.status === 200, "expected assignment-bindings GET success");
}

async function testAssignmentBindingsPostScopesAssignmentLookup() {
  const { POST } = loadTsModule("app/api/assignment-bindings/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        assignment: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected assignment-bindings POST to scope assignment lookup");
            assert(args.where.where.id === "assign_1", "expected assignment-bindings POST to scope assignment id");
            return null;
          },
        },
      },
    },
  });

  const res = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assignmentId: "assign_1", assignmentBriefId: "brief_1" }),
    })
  );
  assert(res.status === 404, "expected assignment-bindings POST to reject invisible assignment");
}

async function testIvGenerateScopesReferenceSpec() {
  const { POST } = loadTsModule("app/api/admin/iv-ad/generate/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected IV generate to use scoped where");
            assert(args.where.where.id === "doc_spec", "expected IV generate to scope reference spec id");
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
      extractIvAdPreviewFromMarkedPdfBuffer: async () => ({ extractedGradeGuess: "PASS", extractedKeyNotesGuess: "", pageCount: 1 }),
      buildIvAdNarrative: () => ({ generalComments: "", actionRequired: "" }),
      normalizeGrade: (v) => v,
    },
    "@/lib/iv-ad/docxFiller": { fillIvAdTemplateDocx: async () => ({ buffer: Buffer.from(""), tableShape: null }) },
    "@/lib/iv-ad/storage": {
      writeIvAdBuffer: async () => ({ storagePath: "storage/out.docx" }),
      writeIvAdUpload: async () => ({ storagePath: "storage/in.pdf" }),
    },
    "@/lib/iv-ad/aiReview": { runIvAdAiReview: async () => ({ ok: false, reason: "DISABLED" }) },
    "@/lib/iv-ad/reviewDraft": { ivAdReviewDraftSchema: { safeParse: () => ({ success: true, data: null }) } },
    "@/lib/storage/provider": { resolveStorageAbsolutePathAsync: async () => null },
    "fs/promises": { readFile: async () => Buffer.from("") },
    path: require("path"),
  });

  const formData = new FormData();
  formData.set("fields", JSON.stringify({
    studentName: "Alex Student",
    programmeTitle: "Programme",
    unitCodeTitle: "4001 - Unit",
    assignmentTitle: "Assignment",
    assessorName: "Assessor",
    internalVerifierName: "IV",
  }));
  formData.set("markedPdf", new File([Buffer.from("pdf")], "marked.pdf", { type: "application/pdf" }));
  formData.set("referenceSpecId", "doc_spec");
  formData.set("reviewApproved", "true");
  formData.set("reviewApprovedBy", "Reviewer");

  const res = await POST(new Request("http://localhost", { method: "POST", body: formData }));
  assert(res.status === 400, "expected IV generate to reject invisible reference spec");
}

async function main() {
  await testAssignmentBindingsGetScopesList();
  await testAssignmentBindingsPostScopesAssignmentLookup();
  await testIvGenerateScopesReferenceSpec();
  console.log("organization scope assignment/iv admin boundary tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
