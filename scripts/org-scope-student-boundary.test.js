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

async function testStudentGetScopesLookup() {
  const scopedWhere = { scoped: "student" };
  const { GET } = loadTsModule("app/api/students/[id]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        assert(where.id === "student_1", "expected student GET to scope student id lookup");
        assert(organizationId === "org_active", "expected student GET to use active org");
        return scopedWhere;
      },
    },
    "@/lib/prisma": {
      prisma: {
        student: {
          findFirst: async (args) => {
            assert(args.where === scopedWhere, "expected student GET to use scoped where");
            return null;
          },
        },
      },
    },
  });

  const res = await GET(new Request("http://localhost/api/students/student_1"), {
    params: Promise.resolve({ id: "student_1" }),
  });
  assert(res.status === 404, "expected student GET to reject invisible student");
}

async function testStudentPatchScopesLookup() {
  const scopedWhere = { scoped: "student" };
  const { PATCH } = loadTsModule("app/api/students/[id]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        assert(where.id === "student_1", "expected student PATCH to scope student id lookup");
        assert(organizationId === "org_active", "expected student PATCH to use active org");
        return scopedWhere;
      },
    },
    "@/lib/prisma": {
      prisma: {
        student: {
          findFirst: async (args) => {
            assert(args.where === scopedWhere, "expected student PATCH to use scoped where");
            return null;
          },
          update: async () => null,
        },
      },
    },
  });

  const res = await PATCH(
    new Request("http://localhost/api/students/student_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Updated Student" }),
    }),
    { params: Promise.resolve({ id: "student_1" }) }
  );
  assert(res.status === 404, "expected student PATCH to reject invisible student");
}

async function testStudentImportScopesLookupsAndWritesOrgId() {
  const scopeCalls = [];
  let createdData = null;
  const { POST } = loadTsModule("app/api/students/import/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        scopeCalls.push({ where, organizationId });
        assert(organizationId === "org_active", "expected student import to use active org");
        return { where, organizationId, scoped: true };
      },
    },
    "@/lib/prisma": {
      prisma: {
        student: {
          findFirst: async () => null,
          create: async (args) => {
            createdData = args.data;
            return { id: "student_new" };
          },
          update: async () => null,
        },
      },
    },
    xlsx: {
      read: () => ({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } }),
      utils: {
        sheet_to_json: () => [
          {
            "Full Name": "Alex Student",
            Email: "alex@example.com",
            "AB Number": "ab123",
          },
        ],
      },
    },
  });

  const formData = new FormData();
  formData.set(
    "file",
    new File([Buffer.from("fake")], "students.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );

  const res = await POST(
    new Request("http://localhost/api/students/import", {
      method: "POST",
      body: formData,
    })
  );

  assert(res.status === 200, "expected student import happy path");
  assert(scopeCalls.length >= 2, "expected student import to scope lookup queries");
  assert(createdData && createdData.organizationId === "org_active", "expected student import to stamp active org on create");
}

async function main() {
  await testStudentGetScopesLookup();
  await testStudentPatchScopesLookup();
  await testStudentImportScopesLookupsAndWritesOrgId();
  console.log("organization scope student boundary tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
