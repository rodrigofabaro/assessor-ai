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

function scopedHelper(expectedOrgId = "org_active") {
  return {
    getRequestOrganizationId: async () => expectedOrgId,
    addOrganizationReadScope: (where, organizationId) => {
      assert(organizationId === expectedOrgId || organizationId === "org_from_unit", "expected active/scoped org");
      return { scoped: true, where, organizationId };
    },
  };
}

async function testAssignmentBriefsGetScopesList() {
  const { GET } = loadTsModule("app/api/assignment-briefs/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        assignmentBrief: {
          findMany: async (args) => {
            assert(args.where.scoped === true, "expected assignment-briefs GET to use scoped where");
            return [];
          },
        },
      },
    },
  });

  const res = await GET();
  assert(res.status === 200, "expected assignment-briefs GET success");
}

async function testAssignmentBriefsPostScopesUnitAndStampsOrg() {
  let createCalled = false;
  const { POST } = loadTsModule("app/api/assignment-briefs/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        unit: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected assignment-briefs POST to scope unit lookup");
            assert(args.where.where.id === "unit_1", "expected assignment-briefs POST to scope unit id");
            return { id: "unit_1", organizationId: "org_from_unit" };
          },
        },
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected assignment-briefs POST to scope brief document lookup");
            assert(args.where.organizationId === "org_from_unit", "expected assignment-briefs POST to reuse unit org");
            return { id: "doc_1" };
          },
        },
        assignmentBrief: {
          create: async (args) => {
            createCalled = true;
            assert(args.data.organizationId === "org_from_unit", "expected assignment-briefs POST to stamp organizationId");
            return { id: "brief_1", ...args.data };
          },
        },
      },
    },
  });

  const res = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        unitId: "unit_1",
        assignmentCode: "A1",
        title: "Brief",
        briefDocumentId: "doc_1",
      }),
    })
  );
  assert(res.status === 200, "expected assignment-briefs POST success");
  assert(createCalled, "expected assignment-briefs POST to create brief");
}

async function testAssignmentBriefMapScopesBriefLookup() {
  const { POST } = loadTsModule("app/api/assignment-briefs/[briefId]/map/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        assignmentBrief: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected brief map to scope brief lookup");
            assert(args.where.where.id === "brief_1", "expected brief map to scope brief id");
            return { id: "brief_1", unitId: "unit_1", organizationId: "org_active" };
          },
        },
        assessmentCriterion: {
          findMany: async () => [{ id: "crit_1" }],
        },
        assignmentCriterionMap: {
          deleteMany: async () => ({ count: 0 }),
          createMany: async () => ({ count: 1 }),
        },
      },
    },
  });

  const res = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ criterionIds: ["crit_1"] }),
    }),
    { params: Promise.resolve({ briefId: "brief_1" }) }
  );
  assert(res.status === 200, "expected brief map POST success");
}

async function testBriefIvScopesBriefLookup() {
  const { GET } = loadTsModule("app/api/briefs/[briefId]/iv/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        assignmentBrief: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected brief IV GET to scope brief lookup");
            assert(args.where.where.id === "brief_1", "expected brief IV GET to scope brief id");
            return {
              id: "brief_1",
              briefDocumentId: "doc_brief",
              briefDocument: { id: "doc_brief", sourceMeta: { ivRecords: [] } },
            };
          },
        },
      },
    },
  });

  const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ briefId: "brief_1" }) });
  assert(res.status === 200, "expected brief IV GET success");
}

async function testBriefIvAttachmentStampsOrganization() {
  let createdOrgId = null;
  const { POST } = loadTsModule("app/api/briefs/[briefId]/iv/[ivId]/attachment/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        assignmentBrief: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected IV attachment to scope brief lookup");
            return {
              id: "brief_1",
              title: "Brief",
              assignmentCode: "A1",
              organizationId: "org_active",
              briefDocumentId: "doc_brief",
              briefDocument: {
                id: "doc_brief",
                sourceMeta: { ivRecords: [{ id: "iv_1", academicYear: "2025-26" }] },
              },
            };
          },
        },
        referenceDocument: {
          create: async (args) => {
            createdOrgId = args.data.organizationId;
            return {
              id: "doc_attach",
              originalFilename: args.data.originalFilename,
              uploadedAt: new Date("2026-03-09T00:00:00.000Z"),
              storagePath: args.data.storagePath,
            };
          },
          update: async () => null,
        },
      },
    },
    "@/lib/iv/evidenceSummary": { extractIvSummaryFromDocxBuffer: async () => null },
    "@/lib/storage/provider": {
      toStorageRelativePath: (_folder, file) => `reference_uploads/${file}`,
      writeStorageFile: async (_path, _buffer) => ({ storagePath: "storage/reference_uploads/file.docx" }),
    },
    uuid: { v4: () => "uuid_test" },
    crypto: require("crypto"),
    path: require("path"),
  });

  const formData = new FormData();
  formData.set(
    "file",
    new File([Buffer.from("docx")], "evidence.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
  );
  const res = await POST(new Request("http://localhost", { method: "POST", body: formData }), {
    params: Promise.resolve({ briefId: "brief_1", ivId: "iv_1" }),
  });
  assert(res.status === 200, "expected IV attachment POST success");
  assert(createdOrgId === "org_active", "expected IV attachment create to stamp org");
}

async function testBriefRubricScopesBriefAndStampsOrganization() {
  let createdOrgId = null;
  const { POST } = loadTsModule("app/api/briefs/[briefId]/rubric/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        assignmentBrief: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected rubric route to scope brief lookup");
            return {
              id: "brief_1",
              assignmentCode: "A1",
              organizationId: "org_active",
              briefDocumentId: "doc_brief",
              briefDocument: { id: "doc_brief", sourceMeta: {} },
            };
          },
        },
        referenceDocument: {
          create: async (args) => {
            createdOrgId = args.data.organizationId;
            return {
              id: "doc_rubric",
              originalFilename: args.data.originalFilename,
              uploadedAt: new Date("2026-03-09T00:00:00.000Z"),
            };
          },
          update: async () => null,
        },
      },
    },
    "@/lib/storage/provider": {
      toStorageRelativePath: (_folder, file) => `reference_uploads/${file}`,
      writeStorageFile: async () => ({ storagePath: "storage/reference_uploads/rubric.pdf" }),
    },
    uuid: { v4: () => "uuid_test" },
    crypto: require("crypto"),
    path: require("path"),
  });

  const formData = new FormData();
  formData.set("file", new File([Buffer.from("pdf")], "rubric.pdf", { type: "application/pdf" }));
  const res = await POST(new Request("http://localhost", { method: "POST", body: formData }), {
    params: Promise.resolve({ briefId: "brief_1" }),
  });
  assert(res.status === 200, "expected rubric POST success");
  assert(createdOrgId === "org_active", "expected rubric create to stamp org");
}

async function testStudentSubmissionsScopeStudentAndList() {
  const { GET } = loadTsModule("app/api/students/[id]/submissions/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        student: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected student submissions route to scope student lookup");
            assert(args.where.where.id === "student_1", "expected student submissions route to scope student id");
            return { id: "student_1", organizationId: "org_active" };
          },
        },
        submission: {
          findMany: async (args) => {
            assert(args.where.scoped === true, "expected student submissions route to scope submission list");
            assert(args.where.where.studentId === "student_1", "expected student submissions route to retain student id filter");
            return [];
          },
        },
      },
    },
  });

  const res = await GET(new Request("http://localhost/api/students/student_1/submissions"), {
    params: Promise.resolve({ id: "student_1" }),
  });
  assert(res.status === 200, "expected student submissions GET success");
}

async function testAssessmentPatchScopesVisibleSubmissionFirst() {
  const { PATCH } = loadTsModule("app/api/submissions/[submissionId]/assessments/[assessmentId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        submission: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected assessment PATCH to scope submission lookup");
            assert(args.where.where.id === "sub_1", "expected assessment PATCH to scope submission id");
            return null;
          },
        },
      },
    },
    "@/lib/grading/markedPdf": { createMarkedPdf: async () => ({ storagePath: "x" }) },
    "@/lib/grading/feedbackDocument": {
      deriveBulletsFromFeedbackText: () => [],
      getDefaultFeedbackTemplate: () => "default",
      renderFeedbackTemplate: () => "",
      summarizeFeedbackText: () => "",
    },
    "@/lib/grading/config": { readGradingConfig: () => ({ config: { maxFeedbackBullets: 5, pageNotesEnabled: false } }) },
    "@/lib/admin/appConfig": { getCurrentAuditActor: async () => "Assessor" },
    "@/lib/grading/pageNotes": {
      buildPageNotesFromCriterionChecks: () => [],
      extractCriterionChecksFromResultJson: () => [],
    },
    "@/lib/grading/studentFeedback": { sanitizeStudentFeedbackText: (v) => v || "" },
  });

  const res = await PATCH(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedbackText: "Updated feedback" }),
    }),
    { params: Promise.resolve({ submissionId: "sub_1", assessmentId: "assessment_1" }) }
  );
  assert(res.status === 404, "expected assessment PATCH to reject invisible submission");
}

async function main() {
  await testAssignmentBriefsGetScopesList();
  await testAssignmentBriefsPostScopesUnitAndStampsOrg();
  await testAssignmentBriefMapScopesBriefLookup();
  await testBriefIvScopesBriefLookup();
  await testBriefIvAttachmentStampsOrganization();
  await testBriefRubricScopesBriefAndStampsOrganization();
  await testStudentSubmissionsScopeStudentAndList();
  await testAssessmentPatchScopesVisibleSubmissionFirst();
  console.log("organization scope brief/assessment boundary tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
