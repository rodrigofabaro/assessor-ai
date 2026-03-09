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

async function testOrgAdminMembershipCanReadOrganizationSettings() {
  const { GET } = loadTsModule("app/api/admin/organizations/[organizationId]/settings/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "user_1", role: "ASSESSOR", orgId: "org_other", isSuperAdmin: false }),
    },
    "@/lib/security/orgSecrets": {
      canEncryptOrgSecrets: () => true,
      encryptOrganizationSecret: (value) => `enc:${value}`,
    },
    "@/lib/admin/settingsAudit": { appendSettingsAuditEvent: () => null },
    "@/lib/prisma": {
      prisma: {
        organizationMembership: {
          findFirst: async (args) => {
            assert(args.where.organizationId === "org_1", "expected membership lookup to target requested organization");
            return { id: "membership_1" };
          },
        },
        organization: {
          findUnique: async (args) => {
            assert(args.where.id === "org_1", "expected organization settings route to load requested organization");
            return { id: "org_1", slug: "org-1", name: "Org 1", isActive: true };
          },
        },
        organizationSetting: {
          findUnique: async () => ({ id: "setting_1", config: { grading: { enabled: true } }, createdAt: new Date(), updatedAt: new Date() }),
        },
        organizationSecret: {
          findMany: async () => [],
        },
      },
    },
  });

  const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ organizationId: "org_1" }) });
  assert(res.status === 200, "expected org-admin membership to read organization settings");
  assert(res.body.organization.id === "org_1", "expected organization payload");
}

async function testSecretWriteRequiresEncryptionConfig() {
  const { PUT } = loadTsModule("app/api/admin/organizations/[organizationId]/settings/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "user_1", role: "ADMIN", orgId: "org_1", isSuperAdmin: false }),
    },
    "@/lib/security/orgSecrets": {
      canEncryptOrgSecrets: () => false,
      encryptOrganizationSecret: () => {
        throw new Error("should not be called");
      },
    },
    "@/lib/admin/settingsAudit": { appendSettingsAuditEvent: () => null },
    "@/lib/prisma": {
      prisma: {
        organization: {
          findUnique: async () => ({ id: "org_1", slug: "org-1", name: "Org 1", isActive: true }),
        },
        organizationMembership: {
          findFirst: async () => null,
        },
      },
    },
  });

  const res = await PUT(
    new Request("http://localhost", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secrets: { OPENAI_API_KEY: "sk-test" } }),
    }),
    { params: Promise.resolve({ organizationId: "org_1" }) }
  );
  assert(res.status === 409, "expected missing encryption config to return 409");
  assert(
    res.body.code === "ORG_SECRET_ENCRYPTION_UNAVAILABLE",
    "expected explicit org secret encryption availability code"
  );
}

async function testSettingsAndSecretWritesEmitAuditEvents() {
  const auditEvents = [];
  let settingsUpserted = false;
  let secretUpserted = false;
  let secretDeleted = false;

  const { PUT } = loadTsModule("app/api/admin/organizations/[organizationId]/settings/route.ts", {
    "next/server": nextServerMock(),
    "@/lib/auth/requestSession": {
      getRequestSession: async () => ({ userId: "super_1", role: "ADMIN", orgId: "org_1", isSuperAdmin: true }),
    },
    "@/lib/security/orgSecrets": {
      canEncryptOrgSecrets: () => true,
      encryptOrganizationSecret: (value) => `enc:${value}`,
    },
    "@/lib/admin/settingsAudit": {
      appendSettingsAuditEvent: (event) => auditEvents.push(event),
    },
    "@/lib/prisma": {
      prisma: {
        organization: {
          findUnique: async () => ({ id: "org_1", slug: "org-1", name: "Org 1", isActive: true }),
        },
        organizationSetting: {
          findUnique: async () => ({ id: "setting_1", config: { existing: true }, createdAt: new Date(), updatedAt: new Date() }),
        },
        organizationSecret: {
          findMany: async () => [],
        },
        $transaction: async (callback) =>
          callback({
            organizationSetting: {
              upsert: async () => {
                settingsUpserted = true;
                return {};
              },
            },
            organizationSecret: {
              deleteMany: async () => {
                secretDeleted = true;
                return { count: 1 };
              },
              upsert: async () => {
                secretUpserted = true;
                return {};
              },
            },
          }),
      },
    },
  });

  const res = await PUT(
    new Request("http://localhost", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        config: { gradingModel: "gpt-5-mini", alertsEnabled: true },
        secrets: { OPENAI_API_KEY: "sk-test", LEGACY_TOKEN: "" },
      }),
    }),
    { params: Promise.resolve({ organizationId: "org_1" }) }
  );

  assert(res.status === 200, "expected organization settings PUT success");
  assert(settingsUpserted, "expected config upsert");
  assert(secretUpserted, "expected secret upsert");
  assert(secretDeleted, "expected blank secret to delete");
  assert(
    auditEvents.some((event) => event.action === "ORGANIZATION_SETTINGS_UPDATED" && event.target === "organization-settings"),
    "expected settings audit event"
  );
  assert(
    auditEvents.some((event) => event.action === "ORGANIZATION_SECRET_ROTATED" && event.target === "organization-secret"),
    "expected secret rotation audit event"
  );
  assert(
    auditEvents.some((event) => event.action === "ORGANIZATION_SECRET_DELETED" && event.target === "organization-secret"),
    "expected secret delete audit event"
  );
}

async function main() {
  await testOrgAdminMembershipCanReadOrganizationSettings();
  await testSecretWriteRequiresEncryptionConfig();
  await testSettingsAndSecretWritesEmitAuditEvents();
  console.log("organization settings contract tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
