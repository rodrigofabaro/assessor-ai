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
  const cacheKey = `${absPath}:${Object.keys(mocks).sort().join("|")}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

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
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
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
  cache.set(cacheKey, mod.exports);
  return mod.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function testUserScopePreferredOrgPreserved() {
  const tx = {
    appUser: { update: async () => null },
    organizationMembership: {
      create: async () => null,
      updateMany: async () => null,
    },
  };
  const prisma = {
    appUser: {
      findUnique: async () => ({
        id: "user_1",
        organizationId: "org_a",
        memberships: [
          { organizationId: "org_a", isDefault: true, isActive: true },
          { organizationId: "org_b", isDefault: false, isActive: true },
        ],
      }),
    },
    $transaction: async (fn) => fn(tx),
  };

  const { ensureUserOrganizationScope, resolvePreferredOrganizationId } = loadTsModule(
    "lib/organizations/userScope.ts",
    {
      "@/lib/prisma": { prisma },
      "@/lib/organizations/defaults": {
        ensureDefaultOrganization: async () => ({ id: "org_default" }),
      },
    }
  );

  assert(
    resolvePreferredOrganizationId({
      preferredOrgId: "org_b",
      legacyOrgId: "org_a",
      memberships: [
        { organizationId: "org_a", isDefault: true },
        { organizationId: "org_b", isDefault: false },
      ],
      fallbackOrgId: "org_default",
    }) === "org_b",
    "expected valid preferred org to override default membership"
  );

  const keptPreferred = await ensureUserOrganizationScope({
    userId: "user_1",
    appRole: "ADMIN",
    preferredOrgId: "org_b",
  });
  assert(keptPreferred.orgId === "org_b", "expected valid switched org to be preserved");
  assert(keptPreferred.linked === false, "expected no backfill writes when org is already valid");

  const fallback = await ensureUserOrganizationScope({
    userId: "user_1",
    appRole: "ADMIN",
    preferredOrgId: "org_missing",
  });
  assert(fallback.orgId === "org_a", "expected invalid preferred org to fall back to default membership");
}

async function testStrictReadSessionValidation() {
  const originalStrict = process.env.AUTH_ORG_SCOPE_STRICT_READS;
  process.env.AUTH_ORG_SCOPE_STRICT_READS = "true";
  let ensureCalls = 0;

  try {
    const { getRequestSession } = loadTsModule("lib/auth/requestSession.ts", {
      "next/headers": {
        cookies: async () => ({
          get: () => ({ value: "signed-token" }),
        }),
      },
      "@/lib/auth/session": {
        getSessionCookieName: () => "assessor_session",
        verifySignedSessionToken: () => ({
          userId: "user_1",
          role: "ADMIN",
          orgId: "org_stale",
          isSuperAdmin: false,
        }),
      },
      "@/lib/organizations/defaults": {
        ensureSuperAdminOrganization: async () => ({ id: "org_super" }),
      },
      "@/lib/organizations/userScope": {
        ensureUserOrganizationScope: async (input) => {
          ensureCalls += 1;
          assert(input.preferredOrgId === "org_stale", "expected strict session validation to pass current org as preferred");
          return { orgId: "org_live", linked: false };
        },
      },
      "@/lib/prisma": {
        prisma: {
          appUser: {
            findFirst: async () => ({ id: "user_1", organizationId: "org_live" }),
          },
        },
      },
    });

    const session = await getRequestSession();
    assert(ensureCalls === 1, "expected strict read mode to revalidate session org scope");
    assert(session?.orgId === "org_live", "expected strict read mode to replace stale org id with validated org id");
  } finally {
    if (originalStrict === undefined) delete process.env.AUTH_ORG_SCOPE_STRICT_READS;
    else process.env.AUTH_ORG_SCOPE_STRICT_READS = originalStrict;
  }
}

async function main() {
  await testUserScopePreferredOrgPreserved();
  await testStrictReadSessionValidation();
  console.log("organization scope session contract tests passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
