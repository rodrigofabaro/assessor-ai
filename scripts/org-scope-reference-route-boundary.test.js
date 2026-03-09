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
      assert(organizationId === "org_active", "expected reference route to use active org");
      return { scoped: true, where, organizationId };
    },
  };
}

async function testMetaGetScopesLookup() {
  const { GET } = loadTsModule("app/api/reference-documents/[documentId]/meta/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected meta GET to use scoped where");
            assert(args.where.where.id === "doc_1", "expected meta GET to scope document id");
            return null;
          },
        },
      },
    },
    "@/lib/extraction/brief/draftIntegrity": { sanitizeBriefDraftArtifacts: (value) => value },
    "@/lib/briefs/gradingScopeChange": {
      applyGradingScopeChangeMeta: () => ({}),
      validateGradingScopeChangeRequest: () => ({ ok: true }),
    },
    "@/lib/ops/eventLog": { appendOpsEvent: () => null },
    "@/lib/admin/appConfig": { getCurrentAuditActor: async () => "tester" },
    "@/lib/admin/permissions": { isAdminMutationAllowed: async () => ({ ok: true }) },
  });

  const res = await GET(new Request("http://localhost"), { params: { documentId: "doc_1" } });
  assert(res.status === 404, "expected meta GET to reject invisible document");
}

async function testFileGetScopesLookup() {
  const { GET } = loadTsModule("app/api/reference-documents/[documentId]/file/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected file GET to use scoped where");
            assert(args.where.where.id === "doc_1", "expected file GET to scope document id");
            return null;
          },
        },
      },
    },
    "@/lib/extraction/storage/resolveStoredFile": { resolveStoredFile: async () => ({ ok: false, tried: [] }) },
    fs: { statSync: () => ({ size: 0 }), createReadStream: () => null },
  });

  const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ documentId: "doc_1" }) });
  assert(res.status === 404, "expected file GET to reject invisible document");
}

async function testUsageGetScopesLookup() {
  const { GET } = loadTsModule("app/api/reference-documents/[documentId]/usage/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected usage GET to use scoped where");
            assert(args.where.where.id === "doc_1", "expected usage GET to scope document id");
            return null;
          },
        },
      },
    },
  });

  const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ documentId: "doc_1" }) });
  assert(res.status === 404, "expected usage GET to reject invisible document");
}

async function testArchivePostScopesLookup() {
  const { POST } = loadTsModule("app/api/reference-documents/[documentId]/archive/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected archive POST to use scoped where");
            assert(args.where.where.id === "doc_1", "expected archive POST to scope document id");
            return null;
          },
        },
      },
    },
  });

  const res = await POST(new Request("http://localhost"), { params: { documentId: "doc_1" } });
  assert(res.status === 404, "expected archive POST to reject invisible document");
}

async function testUnlockPostScopesLookup() {
  const { POST } = loadTsModule("app/api/reference-documents/unlock/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected unlock POST to use scoped where");
            assert(args.where.where.id === "doc_1", "expected unlock POST to scope document id");
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
      body: JSON.stringify({ documentId: "doc_1" }),
    })
  );
  assert(res.status === 404, "expected unlock POST to reject invisible document");
}

async function testExtractPostScopesLookup() {
  const { POST } = loadTsModule("app/api/reference-documents/extract/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected extract POST to use scoped where");
            assert(args.where.where.id === "doc_1", "expected extract POST to scope document id");
            return null;
          },
        },
      },
    },
    "@/lib/extraction/storage/resolveStoredFile": { resolveStoredFile: async () => ({ ok: false, tried: [] }) },
    "@/lib/extraction/index": { extractReferenceDocument: async () => ({}) },
    "@/lib/extraction/brief/draftIntegrity": { sanitizeBriefDraftArtifacts: (value) => value },
    "@/lib/extraction/brief/hardValidation": { validateBriefExtractionHard: () => ({ ok: true, blockerCount: 0, warningCount: 0, score: 1 }) },
    "@/lib/extraction/brief/fidelityReport": {
      attachBriefTaskProvenance: (value) => value,
      buildBriefFidelityReport: () => ({ blockerCount: 0, warningCount: 0 }),
    },
    "@/lib/openai/briefWholePdfRecovery": { recoverBriefFromWholePdfWithOpenAi: async () => ({ ok: false }) },
    fs: { readFile: async () => Buffer.from("") },
  });

  const res = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentId: "doc_1" }),
    })
  );
  assert(res.status === 404, "expected extract POST to reject invisible document");
}

async function testFigureGetScopesLookup() {
  const { GET } = loadTsModule("app/api/reference-documents/[documentId]/figure/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": scopedHelper(),
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected figure GET to use scoped where");
            assert(args.where.where.id === "doc_1", "expected figure GET to scope document id");
            return null;
          },
        },
      },
    },
    "@/lib/extraction/storage/resolveStoredFile": { resolveStoredFile: async () => ({ ok: false, tried: [] }) },
    "@/lib/storage/provider": {
      resolveStorageAbsolutePath: () => null,
      toStorageRelativePath: () => "storage/reference_images/x.png",
      writeStorageFile: async () => null,
    },
    "node:fs/promises": { readFile: async () => { throw new Error("cache miss"); } },
    "node:path": require("node:path"),
    "node:url": require("node:url"),
  });

  const res = await GET(new Request("http://localhost/api/reference-documents/doc_1/figure?token=t1-p1"), {
    params: Promise.resolve({ documentId: "doc_1" }),
  });
  assert(res.status === 404, "expected figure GET to reject invisible document");
}

async function main() {
  await testMetaGetScopesLookup();
  await testFileGetScopesLookup();
  await testUsageGetScopesLookup();
  await testArchivePostScopesLookup();
  await testUnlockPostScopesLookup();
  await testExtractPostScopesLookup();
  await testFigureGetScopesLookup();
  console.log("organization scope reference route boundary tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
