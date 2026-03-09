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

function superAdminSession() {
  return { userId: "super_1", role: "ADMIN", isSuperAdmin: true };
}

async function testDeleteRejectsDefaultOrganization() {
  const { DELETE } = loadTsModule("app/api/admin/organizations/[organizationId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => superAdminSession(),
    },
    "@/lib/organizations/defaults": {
      DEFAULT_ORG_ID: "org_default",
      DEFAULT_ORG_SLUG: "default",
      ensureDefaultOrganization: async () => ({ id: "org_default" }),
      normalizeOrgSlug: (v) => String(v || "").trim().toLowerCase(),
    },
    "@/lib/prisma": {
      prisma: {
        organization: {
          findUnique: async () => ({
            id: "org_default",
            slug: "default",
            name: "Default",
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: {
              users: 0,
              memberships: 0,
              students: 0,
              assignments: 0,
              submissions: 0,
              referenceDocuments: 0,
              units: 0,
              assignmentBriefs: 0,
            },
          }),
        },
      },
    },
  });

  const res = await DELETE(new Request("http://localhost"), {
    params: Promise.resolve({ organizationId: "org_default" }),
  });
  assert(res.status === 400, "expected delete to reject default organization");
}

async function testDeleteRejectsOrganizationWithData() {
  let deleteCalled = false;
  const { DELETE } = loadTsModule("app/api/admin/organizations/[organizationId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => superAdminSession(),
    },
    "@/lib/organizations/defaults": {
      DEFAULT_ORG_ID: "org_default",
      DEFAULT_ORG_SLUG: "default",
      ensureDefaultOrganization: async () => ({ id: "org_default" }),
      normalizeOrgSlug: (v) => String(v || "").trim().toLowerCase(),
    },
    "@/lib/prisma": {
      prisma: {
        organization: {
          findUnique: async () => ({
            id: "org_1",
            slug: "org-1",
            name: "Org 1",
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: {
              users: 1,
              memberships: 0,
              students: 0,
              assignments: 0,
              submissions: 0,
              referenceDocuments: 0,
              units: 0,
              assignmentBriefs: 0,
            },
          }),
          delete: async () => {
            deleteCalled = true;
            return {};
          },
        },
      },
    },
  });

  const res = await DELETE(new Request("http://localhost"), {
    params: Promise.resolve({ organizationId: "org_1" }),
  });
  assert(res.status === 409, "expected delete to reject organization with related data");
  assert(!deleteCalled, "expected delete not to run when related data exists");
}

async function testDeleteAllowsEmptyNonDefaultOrganization() {
  let deleteCalled = false;
  const { DELETE } = loadTsModule("app/api/admin/organizations/[organizationId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => superAdminSession(),
    },
    "@/lib/organizations/defaults": {
      DEFAULT_ORG_ID: "org_default",
      DEFAULT_ORG_SLUG: "default",
      ensureDefaultOrganization: async () => ({ id: "org_default" }),
      normalizeOrgSlug: (v) => String(v || "").trim().toLowerCase(),
    },
    "@/lib/prisma": {
      prisma: {
        organization: {
          findUnique: async () => ({
            id: "org_2",
            slug: "org-2",
            name: "Org 2",
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: {
              users: 0,
              memberships: 0,
              students: 0,
              assignments: 0,
              submissions: 0,
              referenceDocuments: 0,
              units: 0,
              assignmentBriefs: 0,
            },
          }),
          delete: async (args) => {
            deleteCalled = true;
            assert(args.where.id === "org_2", "expected delete to target requested org");
            return {};
          },
        },
      },
    },
  });

  const res = await DELETE(new Request("http://localhost"), {
    params: Promise.resolve({ organizationId: "org_2" }),
  });
  assert(res.status === 200, "expected delete to allow empty non-default organization");
  assert(deleteCalled, "expected delete to run for empty org");
}

async function testPatchRejectsDefaultDeactivation() {
  let updateCalled = false;
  const { PATCH } = loadTsModule("app/api/admin/organizations/[organizationId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => superAdminSession(),
    },
    "@/lib/organizations/defaults": {
      DEFAULT_ORG_ID: "org_default",
      DEFAULT_ORG_SLUG: "default",
      ensureDefaultOrganization: async () => ({ id: "org_default" }),
      normalizeOrgSlug: (v) => String(v || "").trim().toLowerCase(),
    },
    "@/lib/prisma": {
      prisma: {
        organization: {
          findUnique: async () => ({
            id: "org_default",
            slug: "default",
            name: "Default",
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: {
              users: 0,
              memberships: 0,
              students: 0,
              assignments: 0,
              submissions: 0,
              referenceDocuments: 0,
              units: 0,
              assignmentBriefs: 0,
            },
          }),
          update: async () => {
            updateCalled = true;
            return {};
          },
        },
      },
    },
  });

  const res = await PATCH(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    }),
    { params: Promise.resolve({ organizationId: "org_default" }) }
  );
  assert(res.status === 400, "expected patch to reject default org deactivation");
  assert(!updateCalled, "expected update not to run for default deactivation");
}

async function main() {
  await testDeleteRejectsDefaultOrganization();
  await testDeleteRejectsOrganizationWithData();
  await testDeleteAllowsEmptyNonDefaultOrganization();
  await testPatchRejectsDefaultDeactivation();
  console.log("admin organization lifecycle contract tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
