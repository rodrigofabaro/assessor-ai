#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cache = new Map();

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
  const useCache = Object.keys(mocks).length === 0;
  const cacheKey = absPath;
  if (useCache && cache.has(cacheKey)) return cache.get(cacheKey);

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
  if (useCache) cache.set(cacheKey, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createNextServerMock() {
  return {
    NextResponse: {
      json(body, init = {}) {
        return {
          status: Number(init.status || 200),
          body,
        };
      },
    },
  };
}

async function testCommitRouteScopesDocumentLookup() {
  const scopedWhere = { scoped: "doc_lookup" };
  let addScopeCalls = 0;
  let findFirstCalls = 0;

  const { POST } = loadTsModule("app/api/reference-imports/commit/route.ts", {
    "next/server": createNextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        addScopeCalls += 1;
        assert(where.id === "doc_1", "expected commit route to scope reference document id lookup");
        assert(organizationId === "org_active", "expected commit route to use active org for document visibility");
        return scopedWhere;
      },
    },
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            findFirstCalls += 1;
            assert(args.where === scopedWhere, "expected commit route document lookup to use scoped where");
            return null;
          },
        },
      },
    },
    "@/lib/briefs/lockQualityGate": { evaluateBriefLockQuality: () => ({ ok: true }) },
    "@/lib/briefs/mappingCodes": { selectBriefMappingCodes: () => ({ selectedCodes: [], baseCodes: [] }) },
  });

  const req = new Request("http://localhost/api/reference-imports/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ documentId: "doc_1", draft: { kind: "SPEC", unit: { unitCode: "4017", unitTitle: "Unit" } } }),
  });
  const res = await POST(req);
  assert(res.status === 404, "expected commit route to stop when scoped document is not visible");
  assert(addScopeCalls === 1, "expected commit route to call addOrganizationReadScope for document lookup");
  assert(findFirstCalls === 1, "expected commit route to use referenceDocument.findFirst for scoped lookup");
}

async function testCommitRouteScopesOverrideUnitLookup() {
  const docScope = { scoped: "doc_lookup" };
  const unitScope = { scoped: "unit_lookup" };
  const scopeCalls = [];

  const { POST } = loadTsModule("app/api/reference-imports/commit/route.ts", {
    "next/server": createNextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        scopeCalls.push({ where, organizationId });
        if (where.id === "doc_1") return docScope;
        if (where.id === "unit_2") return unitScope;
        return where;
      },
    },
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where === docScope, "expected commit route to scope document lookup");
            return { id: "doc_1", type: "BRIEF", title: "Brief", organizationId: "org_active" };
          },
        },
        unit: {
          findFirst: async (args) => {
            assert(args.where === unitScope, "expected commit route override unit lookup to use scoped where");
            return null;
          },
        },
      },
    },
    "@/lib/briefs/lockQualityGate": { evaluateBriefLockQuality: () => ({ ok: true }) },
    "@/lib/briefs/mappingCodes": { selectBriefMappingCodes: () => ({ selectedCodes: [], baseCodes: [] }) },
  });

  const req = new Request("http://localhost/api/reference-imports/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      documentId: "doc_1",
      unitId: "unit_2",
      draft: { kind: "BRIEF", assignmentCode: "A1", title: "Brief title" },
    }),
  });
  const res = await POST(req);
  assert(res.status === 400, "expected commit route to reject invisible override unit");
  assert(scopeCalls.length >= 2, "expected commit route to scope both document and unit lookups");
}

async function testLockRouteScopesLookups() {
  const docScope = { scoped: "doc_lookup" };
  const unitScope = { scoped: "unit_lookup" };
  const scopeCalls = [];

  const { POST } = loadTsModule("app/api/reference-documents/lock/route.ts", {
    "next/server": createNextServerMock(),
    "@/lib/admin/permissions": {
      isAdminMutationAllowed: async () => ({ ok: true }),
    },
    "@/lib/auth/requestSession": {
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        scopeCalls.push({ where, organizationId });
        if (where.id === "doc_1") return docScope;
        if (where.id === "unit_2") return unitScope;
        return where;
      },
    },
    "@/lib/prisma": {
      prisma: {
        referenceDocument: {
          findFirst: async (args) => {
            assert(args.where === docScope, "expected lock route to scope document lookup");
            return {
              id: "doc_1",
              type: "BRIEF",
              title: "Brief",
              organizationId: "org_active",
              extractedJson: { kind: "BRIEF", assignmentCode: "A1", title: "Brief title" },
            };
          },
        },
        unit: {
          findFirst: async (args) => {
            assert(args.where === unitScope, "expected lock route override unit lookup to use scoped where");
            return null;
          },
        },
      },
    },
    "@/lib/briefs/lockQualityGate": { evaluateBriefLockQuality: () => ({ ok: true }) },
    "@/lib/briefs/mappingCodes": { selectBriefMappingCodes: () => ({ selectedCodes: [], baseCodes: [] }) },
    "@/lib/ops/eventLog": { appendOpsEvent: () => null },
  });

  const req = new Request("http://localhost/api/reference-documents/lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      documentId: "doc_1",
      unitId: "unit_2",
      reviewConfirmed: true,
      draft: { kind: "BRIEF", assignmentCode: "A1", title: "Brief title" },
    }),
  });
  const res = await POST(req);
  assert(res.status === 400, "expected lock route to reject invisible override unit");
  assert(scopeCalls.length >= 2, "expected lock route to scope both document and unit lookups");
}

async function main() {
  await testCommitRouteScopesDocumentLookup();
  await testCommitRouteScopesOverrideUnitLookup();
  await testLockRouteScopesLookups();
  console.log("organization scope reference boundary tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
