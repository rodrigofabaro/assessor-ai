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

async function testAppConfigScopesActiveAuditUserForOrgAdmin() {
  const { PUT } = loadTsModule("app/api/admin/app-config/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/admin/settingsPermissions": {
      getSettingsReadContext: async () => ({ canRead: true }),
      getSettingsWriteContext: async () => ({ canWrite: true, role: "ADMIN" }),
    },
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "admin_1", role: "ADMIN", orgId: "org_active", isSuperAdmin: false }),
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        assert(organizationId === "org_active", "expected app-config route to use active org");
        return { scoped: true, where, organizationId };
      },
    },
    "@/lib/admin/appConfig": {
      getOrCreateAppConfig: async () => ({ id: 1, activeAuditUserId: null, activeAuditUser: null }),
      getCurrentAuditActor: async () => "Admin",
    },
    "@/lib/admin/automationPolicy": {
      readAutomationPolicy: async () => ({ policy: { enabled: false }, source: "db" }),
      writeAutomationPolicy: async () => ({ enabled: false }),
    },
    "@/lib/admin/settingsAudit": { appendSettingsAuditEvent: () => null },
    "@/lib/prisma": {
      prisma: {
        appUser: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected app-config route to scope audit user lookup");
            assert(args.where.where.id === "user_2", "expected app-config route to keep requested user id");
            return null;
          },
        },
      },
    },
  });

  const res = await PUT(
    new Request("http://localhost", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activeAuditUserId: "user_2" }),
    })
  );
  assert(res.status === 404, "expected app-config route to reject cross-org audit user");
}

async function testBatchSettingsScopesActiveAuditUserForOrgAdmin() {
  const { PUT } = loadTsModule("app/api/admin/settings/batch/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/admin/settingsPermissions": {
      getSettingsWriteContext: async () => ({ canWrite: true, role: "ADMIN", user: null }),
    },
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "admin_1", role: "ADMIN", orgId: "org_active", isSuperAdmin: false }),
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: (where, organizationId) => {
        assert(organizationId === "org_active", "expected batch settings route to use active org");
        return { scoped: true, where, organizationId };
      },
    },
    "@/lib/admin/appConfig": {
      getCurrentAuditActor: async () => "Admin",
      getOrCreateAppConfig: async () => ({ activeAuditUserId: null }),
    },
    "@/lib/openai/modelConfig": { readOpenAiModel: () => ({ model: "gpt-5-mini", autoCleanupApproved: false }), writeOpenAiModel: () => ({}) },
    "@/lib/grading/config": { readGradingConfig: () => ({ config: {} }), writeGradingConfig: () => ({}) },
    "@/lib/admin/automationPolicy": { readAutomationPolicy: async () => ({ policy: { enabled: false } }), writeAutomationPolicy: async () => ({}) },
    "@/lib/admin/settingsAudit": { appendSettingsAuditEvent: () => null },
    "@/lib/grading/feedbackDocument": { FEEDBACK_TEMPLATE_REQUIRED_TOKENS: [] },
    "@/lib/prisma": {
      prisma: {
        appUser: {
          findFirst: async (args) => {
            assert(args.where.scoped === true, "expected batch settings route to scope audit user lookup");
            assert(args.where.where.id === "user_2", "expected batch settings route to keep requested user id");
            return null;
          },
        },
      },
    },
  });

  const res = await PUT(
    new Request("http://localhost", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app: { activeAuditUserId: "user_2" } }),
    })
  );
  assert(res.status === 404, "expected batch settings route to reject cross-org audit user");
}

async function testSuperAdminCanStillSelectGlobalAuditUser() {
  let upsertCalled = false;
  const { PUT } = loadTsModule("app/api/admin/app-config/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/admin/settingsPermissions": {
      getSettingsReadContext: async () => ({ canRead: true }),
      getSettingsWriteContext: async () => ({ canWrite: true, role: "SUPER_ADMIN" }),
    },
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "super_1", role: "ADMIN", orgId: "org_active", isSuperAdmin: true }),
      getRequestOrganizationId: async () => "org_active",
      addOrganizationReadScope: () => {
        throw new Error("super-admin global lookup should not require scoped helper");
      },
    },
    "@/lib/admin/appConfig": {
      getOrCreateAppConfig: async () => ({ id: 1, activeAuditUserId: null, activeAuditUser: null }),
      getCurrentAuditActor: async () => "SuperAdmin",
    },
    "@/lib/admin/automationPolicy": {
      readAutomationPolicy: async () => ({ policy: { enabled: false }, source: "db" }),
      writeAutomationPolicy: async () => ({ enabled: false }),
    },
    "@/lib/admin/settingsAudit": { appendSettingsAuditEvent: () => null },
    "@/lib/prisma": {
      prisma: {
        appUser: {
          findUnique: async (args) => {
            assert(args.where.id === "user_global", "expected super-admin to use global user lookup");
            return { id: "user_global" };
          },
        },
        appConfig: {
          upsert: async () => {
            upsertCalled = true;
            return { id: 1, activeAuditUserId: "user_global", activeAuditUser: null };
          },
        },
      },
    },
  });

  const res = await PUT(
    new Request("http://localhost", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activeAuditUserId: "user_global" }),
    })
  );
  assert(res.status === 200, "expected super-admin app-config update success");
  assert(upsertCalled, "expected super-admin app-config update to persist");
}

async function main() {
  await testAppConfigScopesActiveAuditUserForOrgAdmin();
  await testBatchSettingsScopesActiveAuditUserForOrgAdmin();
  await testSuperAdminCanStillSelectGlobalAuditUser();
  console.log("admin settings org boundary tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
