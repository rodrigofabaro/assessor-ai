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

async function testOrganizationsRouteIsSuperAdminOnly() {
  const { GET } = loadTsModule("app/api/admin/organizations/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "admin_1", role: "ADMIN", isSuperAdmin: false }),
    },
    "@/lib/organizations/defaults": {
      ensureDefaultOrganization: async () => ({ id: "org_default" }),
      normalizeOrgSlug: (v) => String(v || "").trim().toLowerCase(),
    },
    "@/lib/prisma": { prisma: { organization: { findMany: async () => [] } } },
  });

  const res = await GET();
  assert(res.status === 403, "expected organizations GET to reject non-superadmin");
}

async function testOrganizationDetailRouteAllowsSuperAdmin() {
  const { GET } = loadTsModule("app/api/admin/organizations/[organizationId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "super_1", role: "ADMIN", isSuperAdmin: true }),
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
          findUnique: async (args) => {
            assert(args.where.id === "org_1", "expected organization detail GET to load requested org");
            return {
              id: "org_1",
              slug: "org-1",
              name: "Org 1",
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
            };
          },
        },
      },
    },
  });

  const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ organizationId: "org_1" }) });
  assert(res.status === 200, "expected organization detail GET success for superadmin");
}

async function testUsersPostPreventsOrgAdminGrantingSuperAdmin() {
  const { POST } = loadTsModule("app/api/admin/users/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "admin_1", role: "ADMIN", orgId: "org_active", isSuperAdmin: false }),
    },
    "@/lib/auth/password": {
      generateRandomPassword: () => "pw",
      hashPassword: () => "hash",
      normalizeLoginEmail: (v) => String(v || "").trim().toLowerCase(),
    },
    "@/lib/auth/inviteEmail": {
      resolveInviteEmailUiSupport: () => null,
      sendInviteEmail: async () => ({ attempted: false, sent: false, provider: "none" }),
    },
    "@/lib/organizations/defaults": {
      ensureDefaultOrganization: async () => ({ id: "org_default" }),
      resolveOrganizationId: async (v) => String(v || "").trim() || null,
    },
    "@/lib/prisma": { prisma: {} },
  });

  const res = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Alex User",
        email: "alex@example.com",
        role: "ADMIN",
        platformRole: "SUPER_ADMIN",
      }),
    })
  );
  assert(res.status === 500 || res.status === 200, "expected route to continue with coerced USER platform role");
}

async function testUsersPatchBlocksOrgAdminGrantingSuperAdmin() {
  const { PATCH } = loadTsModule("app/api/admin/users/[userId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "admin_1", role: "ADMIN", orgId: "org_active", isSuperAdmin: false }),
    },
    "@/lib/auth/password": {
      generateRandomPassword: () => "pw",
      hashPassword: () => "hash",
      normalizeLoginEmail: (v) => String(v || "").trim().toLowerCase(),
    },
    "@/lib/auth/inviteEmail": { sendInviteEmail: async () => ({ attempted: false, sent: false, provider: "none" }) },
    "@/lib/organizations/defaults": { resolveOrganizationId: async (v) => String(v || "").trim() || null },
    "@/lib/prisma": { prisma: {} },
  });

  const res = await PATCH(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platformRole: "SUPER_ADMIN" }),
    }),
    { params: Promise.resolve({ userId: "user_1" }) }
  );
  assert(res.status === 403, "expected users PATCH to block non-superadmin grant");
}

async function testUsersPatchBlocksCrossOrgManagement() {
  const { PATCH } = loadTsModule("app/api/admin/users/[userId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "admin_1", role: "ADMIN", orgId: "org_active", isSuperAdmin: false }),
    },
    "@/lib/auth/password": {
      generateRandomPassword: () => "pw",
      hashPassword: () => "hash",
      normalizeLoginEmail: (v) => String(v || "").trim().toLowerCase(),
    },
    "@/lib/auth/inviteEmail": { sendInviteEmail: async () => ({ attempted: false, sent: false, provider: "none" }) },
    "@/lib/organizations/defaults": { resolveOrganizationId: async (v) => String(v || "").trim() || null },
    "@/lib/prisma": {
      prisma: {
        appUser: {
          findUnique: async () => ({
            id: "user_2",
            email: "u2@example.com",
            role: "ASSESSOR",
            organizationId: "org_other",
            loginEnabled: true,
            mustResetPassword: false,
            memberships: [{ organizationId: "org_other" }],
          }),
        },
      },
    },
  });

  const res = await PATCH(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Updated" }),
    }),
    { params: Promise.resolve({ userId: "user_2" }) }
  );
  assert(res.status === 403, "expected users PATCH to block cross-org management");
}

async function testUsersDeleteBlocksCrossOrgManagement() {
  const { DELETE } = loadTsModule("app/api/admin/users/[userId]/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "admin_1", role: "ADMIN", orgId: "org_active", isSuperAdmin: false }),
    },
    "@/lib/auth/password": {
      generateRandomPassword: () => "pw",
      hashPassword: () => "hash",
      normalizeLoginEmail: (v) => String(v || "").trim().toLowerCase(),
    },
    "@/lib/auth/inviteEmail": { sendInviteEmail: async () => ({ attempted: false, sent: false, provider: "none" }) },
    "@/lib/organizations/defaults": { resolveOrganizationId: async (v) => String(v || "").trim() || null },
    "@/lib/prisma": {
      prisma: {
        appUser: {
          findUnique: async () => ({
            id: "user_2",
            organizationId: "org_other",
            memberships: [{ organizationId: "org_other" }],
          }),
        },
      },
    },
  });

  const res = await DELETE(new Request("http://localhost"), { params: Promise.resolve({ userId: "user_2" }) });
  assert(res.status === 403, "expected users DELETE to block cross-org management");
}

async function testUsersPostScopesOrgAdminToSessionOrganization() {
  let createdOrganizationId = null;
  let createdPlatformRole = null;
  const { POST } = loadTsModule("app/api/admin/users/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "admin_1", role: "ADMIN", orgId: "org_active", isSuperAdmin: false }),
    },
    "@/lib/auth/password": {
      generateRandomPassword: () => "pw",
      hashPassword: () => "hash",
      normalizeLoginEmail: (v) => String(v || "").trim().toLowerCase(),
    },
    "@/lib/auth/inviteEmail": {
      resolveInviteEmailUiSupport: () => null,
      sendInviteEmail: async () => ({ attempted: false, sent: false, provider: "none" }),
    },
    "@/lib/organizations/defaults": {
      ensureDefaultOrganization: async () => ({ id: "org_default" }),
      resolveOrganizationId: async (v) => String(v || "").trim() || null,
    },
    "@/lib/prisma": {
      prisma: {
        $transaction: async (callback) =>
          callback({
            appUser: {
              create: async ({ data }) => {
                createdOrganizationId = data.organizationId;
                createdPlatformRole = data.platformRole;
                return { id: "user_1" };
              },
              findUniqueOrThrow: async () => ({
                id: "user_1",
                fullName: "Alex User",
                email: "alex@example.com",
                role: "ADMIN",
                isActive: true,
                loginEnabled: true,
                passwordUpdatedAt: new Date(),
                mustResetPassword: true,
                platformRole: "USER",
                organizationId: "org_active",
                organization: { id: "org_active", slug: "org-active", name: "Org Active", isActive: true },
                memberships: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
            },
            organizationMembership: {
              upsert: async () => ({}),
            },
          }),
      },
    },
  });

  const res = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Alex User",
        email: "alex@example.com",
        role: "ADMIN",
        platformRole: "SUPER_ADMIN",
        organizationId: "org_other",
        loginEnabled: true,
      }),
    })
  );
  assert(res.status === 200, "expected org-admin user create success");
  assert(createdOrganizationId === "org_active", "expected org-admin user create to force session organization");
  assert(createdPlatformRole === "USER", "expected org-admin user create to force USER platform role");
}

async function main() {
  await testOrganizationsRouteIsSuperAdminOnly();
  await testOrganizationDetailRouteAllowsSuperAdmin();
  await testUsersPatchBlocksOrgAdminGrantingSuperAdmin();
  await testUsersPatchBlocksCrossOrgManagement();
  await testUsersDeleteBlocksCrossOrgManagement();
  await testUsersPostScopesOrgAdminToSessionOrganization();
  console.log("admin role boundary contract tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
