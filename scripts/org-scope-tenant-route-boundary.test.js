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

async function testDebugExtractScopesDocumentLookup() {
  const scopedWhere = { scoped: "doc" };
  let addScopeCalls = 0;
  const { POST } = loadTsModule("app/api/reference-documents/debug-extract/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        addScopeCalls += 1;
        assert(where.id === "doc_1", "expected debug extract to scope document id lookup");
        assert(organizationId === "org_active", "expected debug extract to use active org");
        return scopedWhere;
      },
    },
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where === scopedWhere, "expected debug extract to use scoped where");
            return null;
          },
        },
      },
    },
    "@/lib/extraction/text/pdfToText": { pdfToText: async () => ({ text: "", pageCount: 0 }) },
    "@/lib/extractors/brief": { debugBriefExtraction: () => ({}) },
    "@/lib/storage/provider": { resolveStorageAbsolutePathAsync: async () => null },
  });

  const res = await POST(
    new Request("http://localhost/api/reference-documents/debug-extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentId: "doc_1" }),
    })
  );
  assert(res.status === 404, "expected debug extract to reject invisible document");
  assert(addScopeCalls === 1, "expected debug extract to call addOrganizationReadScope once");
}

async function testSubmissionGetScopesLookup() {
  const scopedWhere = { scoped: "submission" };
  const { GET } = loadTsModule("app/api/submissions/[submissionId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        assert(where.id === "sub_1", "expected submission GET to scope submission id lookup");
        assert(organizationId === "org_active", "expected submission GET to use active org");
        return scopedWhere;
      },
    },
    "@/lib/prisma": {
      prisma: {
        submission: {
          findFirst: async (args) => {
            assert(args.where === scopedWhere, "expected submission GET to use scoped where");
            return null;
          },
        },
      },
    },
    "@/lib/submissions/coverMetadata": { isCoverMetadataReady: () => false },
    "@/lib/grading/studentFeedback": { sanitizeStudentFeedbackText: (value) => value },
    "@/lib/submissions/autoGrade": { triggerAutoGradeIfAutoReady: async () => null },
  });

  const res = await GET(new Request("http://localhost/api/submissions/sub_1"), {
    params: Promise.resolve({ submissionId: "sub_1" }),
  });
  assert(res.status === 404, "expected submission GET to reject invisible submission");
}

async function testSubmissionLinkScopesSubmissionAndStudent() {
  const submissionScope = { scoped: "submission" };
  const studentScope = { scoped: "student" };
  const scopeCalls = [];

  const { POST } = loadTsModule("app/api/submissions/[submissionId]/link-student/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        scopeCalls.push({ where, organizationId });
        if (where.id === "sub_1") return submissionScope;
        if (where.id === "student_9") return studentScope;
        return where;
      },
    },
    "@/lib/prisma": {
      prisma: {
        submission: {
          findFirst: async (args) => {
            assert(args.where === submissionScope, "expected link-student to scope submission lookup");
            return { id: "sub_1", studentId: null, organizationId: "org_active" };
          },
          update: async () => null,
          findUnique: async () => null,
        },
        student: {
          findFirst: async (args) => {
            assert(args.where === studentScope, "expected link-student to scope student lookup");
            return null;
          },
        },
        submissionAuditEvent: {
          create: async () => null,
        },
      },
    },
    "@/lib/admin/appConfig": { getCurrentAuditActor: async () => "tester" },
    "@/lib/submissions/autoGrade": { triggerAutoGradeIfAutoReady: async () => null },
  });

  const res = await POST(
    new Request("http://localhost/api/submissions/sub_1/link-student", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentId: "student_9" }),
    }),
    { params: Promise.resolve({ submissionId: "sub_1" }) }
  );
  assert(res.status === 404, "expected link-student to reject invisible student");
  assert(scopeCalls.length >= 2, "expected link-student to scope both submission and student");
}

async function testUnitPatchScopesLookup() {
  const scopedWhere = { scoped: "unit" };
  const { PATCH } = loadTsModule("app/api/units/[unitId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        assert(where.id === "unit_1", "expected unit PATCH to scope unit id lookup");
        assert(organizationId === "org_active", "expected unit PATCH to use active org");
        return scopedWhere;
      },
    },
    "@/lib/prisma": {
      prisma: {
        unit: {
          findFirst: async (args) => {
            assert(args.where === scopedWhere, "expected unit PATCH to use scoped where");
            return null;
          },
          update: async () => null,
        },
      },
    },
  });

  const res = await PATCH(
    new Request("http://localhost/api/units/unit_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitTitle: "New title" }),
    }),
    { params: Promise.resolve({ unitId: "unit_1" }) }
  );
  assert(res.status === 404, "expected unit PATCH to reject invisible unit");
}

async function main() {
  await testDebugExtractScopesDocumentLookup();
  await testSubmissionGetScopesLookup();
  await testSubmissionLinkScopesSubmissionAndStudent();
  await testUnitPatchScopesLookup();
  console.log("organization scope tenant route boundary tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
