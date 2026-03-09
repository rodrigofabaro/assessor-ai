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

async function testSpecUsageAllowsDeleteWhenUnused() {
  const { GET } = loadTsModule("app/api/reference-documents/[documentId]/usage/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async () => ({ id: "doc_spec", type: "SPEC", status: "FAILED", lockedAt: null }),
        },
        unit: {
          findMany: async (args) => {
            assert(args.where.scoped === true, "expected spec usage to scope linked unit lookup");
            assert(args.where.where.specDocumentId === "doc_spec", "expected spec usage to check linked units");
            return [];
          },
        },
        submission: {
          count: async () => 0,
        },
      },
    },
  });

  const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ documentId: "doc_spec" }) });
  assert(res.status === 200, "expected spec usage GET success");
  assert(res.body.canDelete === true, "expected unused spec to be deletable");
  assert(res.body.linkedUnitCount === 0, "expected no linked units");
}

async function testSpecDeleteDetachesUnitsAndDeletesDocument() {
  let unitDetachCalled = false;
  let documentDeleteCalled = false;
  let storageDeleteCalled = false;

  const { DELETE } = loadTsModule("app/api/reference-documents/[documentId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async () => ({
            id: "doc_spec",
            type: "SPEC",
            lockedAt: null,
            status: "FAILED",
            storagePath: "reference_uploads/u64-spec.pdf",
            originalFilename: "U64 - Spec.pdf",
          }),
          delete: async (args) => {
            documentDeleteCalled = true;
            assert(args.where.id === "doc_spec", "expected delete to target spec document");
            return {};
          },
        },
        unit: {
          findMany: async (args) => {
            assert(args.where.scoped === true, "expected spec delete to scope linked unit lookup");
            return [{ id: "unit_1", unitCode: "U64" }];
          },
          updateMany: async (args) => {
            unitDetachCalled = true;
            assert(args.where.id.in[0] === "unit_1", "expected spec delete to detach linked units");
            assert(args.data.specDocumentId === null, "expected spec delete to clear specDocumentId");
            return { count: 1 };
          },
        },
        submission: {
          count: async (args) => {
            assert(args.where.scoped === true, "expected spec delete to scope submission usage count");
            return 0;
          },
        },
        assignmentBrief: {
          findMany: async () => [],
          updateMany: async () => ({ count: 0 }),
        },
      },
    },
    "@/lib/storage/provider": {
      deleteStorageFile: async (storagePath) => {
        storageDeleteCalled = true;
        assert(storagePath === "reference_uploads/u64-spec.pdf", "expected spec delete to remove storage file");
      },
    },
  });

  const res = await DELETE(new Request("http://localhost"), { params: { documentId: "doc_spec" } });
  assert(res.status === 200, "expected spec delete success");
  assert(unitDetachCalled, "expected linked units to be detached");
  assert(documentDeleteCalled, "expected spec document delete");
  assert(storageDeleteCalled, "expected storage file delete");
}

async function testSpecDeleteRejectsWhenSubmissionsExist() {
  const { DELETE } = loadTsModule("app/api/reference-documents/[documentId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async () => ({
            id: "doc_spec",
            type: "SPEC",
            lockedAt: null,
            status: "EXTRACTED",
            storagePath: "reference_uploads/u64-spec.pdf",
            originalFilename: "U64 - Spec.pdf",
          }),
        },
        unit: {
          findMany: async () => [{ id: "unit_1", unitCode: "U64" }],
          updateMany: async () => ({ count: 0 }),
        },
        submission: {
          count: async () => 3,
        },
        assignmentBrief: {
          findMany: async () => [],
          updateMany: async () => ({ count: 0 }),
        },
      },
    },
    "@/lib/storage/provider": { deleteStorageFile: async () => null },
  });

  const res = await DELETE(new Request("http://localhost"), { params: { documentId: "doc_spec" } });
  assert(res.status === 409, "expected spec delete to reject when linked submissions exist");
  assert(res.body.error === "REFERENCE_IN_USE", "expected generic in-use error");
}

async function main() {
  await testSpecUsageAllowsDeleteWhenUnused();
  await testSpecDeleteDetachesUnitsAndDeletesDocument();
  await testSpecDeleteRejectsWhenSubmissionsExist();
  console.log("reference document delete lifecycle tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
