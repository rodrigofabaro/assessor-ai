import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSignedSessionToken, getSessionCookieName, hasSessionSecret } from "@/lib/auth/session";
import { parseRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/prisma";
import { normalizeLoginEmail, verifyPassword } from "@/lib/auth/password";
import { ensureDefaultOrganization, ensureSuperAdminOrganization } from "@/lib/organizations/defaults";
import {
  pickDefaultMembership,
  resolveSessionRole,
  isSuperAdminPlatformRole,
} from "@/lib/organizations/membership";
import { ensureUserOrganizationScope } from "@/lib/organizations/userScope";

export const runtime = "nodejs";

const ONE_DAY_SECONDS = 60 * 60 * 24;

type MembershipRole = "ORG_ADMIN" | "ASSESSOR" | "IV" | "VIEWER";

type AppUserRecord = {
  id: string;
  email: string | null;
  role: string;
  platformRole?: "USER" | "SUPER_ADMIN" | null;
  loginPasswordHash: string | null;
  mustResetPassword?: boolean | null;
  organizationId?: string | null;
  memberships?: Array<{
    organizationId: string;
    role: MembershipRole;
    isDefault: boolean;
  }>;
  loginEnabled?: boolean | null;
  isActive?: boolean | null;
};

type AppUserAuth = {
  userId: string;
  role: "ADMIN" | "ASSESSOR" | "IV";
  source: "app-user";
  mustResetPassword: boolean;
  email: string;
  orgId: string | null;
  isSuperAdmin: boolean;
};

type EnvAuth = {
  userId: string;
  role: "ADMIN" | "ASSESSOR" | "IV";
  source: "env";
  orgId: string | null;
  isSuperAdmin: boolean;
};

function isModernAppUser(user: AppUserRecord) {
  return typeof user.platformRole === "string";
}

async function findAppUserCandidates(email: string, options?: { requireLoginEnabled?: boolean }) {
  const requireLoginEnabled = options?.requireLoginEnabled !== false;
  const whereWithLoginEnabled = { email, isActive: true, ...(requireLoginEnabled ? { loginEnabled: true } : {}) };
  const whereWithoutLoginEnabled = { email, isActive: true };
  const whereEmailOnly = { email };

  try {
    const users = await prisma.appUser.findMany({
      where: whereWithLoginEnabled,
      take: 20,
      select: {
        id: true,
        email: true,
        role: true,
        platformRole: true,
        loginPasswordHash: true,
        mustResetPassword: true,
        organizationId: true,
        memberships: {
          where: { isActive: true, organization: { isActive: true } },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: {
            organizationId: true,
            role: true,
            isDefault: true,
          },
        },
      },
    });
    return users as AppUserRecord[];
  } catch (error) {
    if (!isOrgSchemaCompatError(error)) throw error;
  }

  try {
    const users = await prisma.appUser.findMany({
      where: whereWithLoginEnabled,
      take: 20,
      select: {
        id: true,
        email: true,
        role: true,
        loginPasswordHash: true,
        mustResetPassword: true,
        organizationId: true,
        loginEnabled: true,
        isActive: true,
      },
    });
    return users as AppUserRecord[];
  } catch (error) {
    if (!isOrgSchemaCompatError(error)) throw error;
  }

  try {
    const users = await prisma.appUser.findMany({
      where: whereWithoutLoginEnabled,
      take: 20,
      select: {
        id: true,
        email: true,
        role: true,
        loginPasswordHash: true,
        mustResetPassword: true,
        organizationId: true,
        isActive: true,
      },
    });
    return users as AppUserRecord[];
  } catch (error) {
    if (!isOrgSchemaCompatError(error)) throw error;
  }

  const users = await prisma.appUser.findMany({
    where: whereEmailOnly,
    take: 20,
    select: {
      id: true,
      email: true,
      role: true,
      loginPasswordHash: true,
      organizationId: true,
    },
  }).catch(async (error) => {
    if (!isOrgSchemaCompatError(error)) throw error;
    return prisma.appUser.findMany({
      where: whereEmailOnly,
      take: 20,
      select: {
        id: true,
        email: true,
        role: true,
        loginPasswordHash: true,
      },
    });
  });
  return users as AppUserRecord[];
}

function buildAuthFromUser(input: {
  user: AppUserRecord;
  emailFallback: string;
}): AppUserAuth | null {
  const memberships = Array.isArray(input.user.memberships) ? input.user.memberships : [];
  const primaryMembership = pickDefaultMembership(memberships);
  const role = resolveSessionRole({
    platformRole: isModernAppUser(input.user) ? input.user.platformRole : null,
    membershipRole: primaryMembership?.role,
    legacyRole: input.user.role,
  });
  if (!role) return null;

  const isSuperAdmin = isSuperAdminPlatformRole(isModernAppUser(input.user) ? input.user.platformRole : null);

  const orgId = String(primaryMembership?.organizationId || input.user.organizationId || "").trim() || null;
  return {
    userId: input.user.id,
    role,
    source: "app-user",
    mustResetPassword: !!input.user.mustResetPassword,
    email: input.user.email || input.emailFallback,
    orgId,
    isSuperAdmin,
  };
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function secureCompare(input: string, expected: string) {
  const inputHash = crypto.createHash("sha256").update(input).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

function isOrgSchemaCompatError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return (
    message.includes("platformrole") ||
    message.includes("organizationid") ||
    message.includes("loginenabled") ||
    message.includes("mustresetpassword") ||
    message.includes("passwordupdatedat") ||
    message.includes("isactive") ||
    message.includes("organizationmembership") ||
    message.includes("memberships") ||
    (message.includes("unknown argument") && message.includes("platform")) ||
    (message.includes("unknown argument") && message.includes("organization")) ||
    (message.includes("unknown argument") && message.includes("login")) ||
    (message.includes("unknown argument") && message.includes("password")) ||
    (message.includes("unknown argument") && message.includes("isactive")) ||
    (message.includes("unknown argument") && message.includes("memberships")) ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

async function tryAuthenticateAppUser(username: string, password: string) {
  const email = normalizeLoginEmail(username);
  if (!email || !password) return null;
  const users = await findAppUserCandidates(email, { requireLoginEnabled: true });
  for (const user of users) {
    if (user.isActive === false) continue;
    if (typeof user.loginEnabled === "boolean" && !user.loginEnabled) continue;
    if (!user?.loginPasswordHash) continue;
    if (!verifyPassword(password, user.loginPasswordHash)) continue;
    const auth = buildAuthFromUser({
      user,
      emailFallback: email,
    });
    if (auth) return auth;
  }
  return null;
}

async function parseCredentials(req: Request) {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      username: toSafeString(body.username),
      password: toSafeString(body.password),
    };
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    return {
      username: toSafeString(form?.get("username")),
      password: toSafeString(form?.get("password")),
    };
  }
  return { username: "", password: "" };
}

export async function POST(req: Request) {
  const expectedUsername = toSafeString(process.env.AUTH_LOGIN_USERNAME);
  const expectedPassword = toSafeString(process.env.AUTH_LOGIN_PASSWORD);
  const envRole = parseRole(process.env.AUTH_LOGIN_ROLE) || "ADMIN";

  if (!hasSessionSecret()) {
    return NextResponse.json({ error: "AUTH_SESSION_SECRET is not configured.", code: "AUTH_SESSION_SECRET_MISSING" }, { status: 503 });
  }

  const { username, password } = await parseCredentials(req);
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required.", code: "AUTH_CREDENTIALS_REQUIRED" }, { status: 400 });
  }

  let auth:
    | AppUserAuth
    | EnvAuth
    | null = null;
  try {
    auth = await tryAuthenticateAppUser(username, password);
  } catch {
    auth = null;
  }

  if (!auth && expectedUsername && expectedPassword) {
    const isEnvValid = secureCompare(username, expectedUsername) && secureCompare(password, expectedPassword);
    if (isEnvValid) {
      const superAdminOrg = await ensureSuperAdminOrganization().catch(() => null);
      const defaultOrg = await ensureDefaultOrganization();
      auth = {
        userId: `env:${expectedUsername}`,
        role: envRole,
        source: "env",
        orgId: String(superAdminOrg?.id || defaultOrg.id || "").trim() || null,
        isSuperAdmin: true,
      };
    }
  }

  if (!auth) {
    return NextResponse.json(
      { error: "Invalid credentials.", code: "AUTH_INVALID_CREDENTIALS" },
      { status: 401 }
    );
  }

  if (auth.source === "app-user" && auth.mustResetPassword) {
    return NextResponse.json(
      { error: "Password reset required before sign in.", code: "AUTH_PASSWORD_RESET_REQUIRED", username: auth.email },
      { status: 403 }
    );
  }

  if (auth.source === "app-user") {
    try {
      let preferredOrgId = auth.orgId;
      let superAdminOrgId: string | null = null;
      if (auth.isSuperAdmin) {
        const superAdminOrg = await ensureSuperAdminOrganization().catch(() => null);
        superAdminOrgId = String(superAdminOrg?.id || "").trim() || null;
        preferredOrgId = superAdminOrgId || preferredOrgId;
      }
      const ensured = await ensureUserOrganizationScope({
        userId: auth.userId,
        appRole: auth.role,
        preferredOrgId,
      });
      if (superAdminOrgId) {
        auth.orgId = superAdminOrgId;
      } else if (String(ensured.orgId || "").trim()) {
        auth.orgId = String(ensured.orgId || "").trim();
      } else if (preferredOrgId) {
        auth.orgId = preferredOrgId;
      }
    } catch {
      // Keep login non-blocking; request-session hydration can still repair org context.
    }
  }

  const token = createSignedSessionToken({
    userId: auth.userId,
    role: auth.role,
    orgId: auth.orgId,
    isSuperAdmin: auth.isSuperAdmin,
    ttlSeconds: ONE_DAY_SECONDS,
  });

  const res = NextResponse.json({
    ok: true,
    role: auth.role,
    source: auth.source,
    orgId: auth.orgId,
    isSuperAdmin: auth.isSuperAdmin,
  });
  res.cookies.set({
    name: getSessionCookieName(),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_DAY_SECONDS,
  });
  // Clear legacy role cookie so middleware relies only on signed session.
  res.cookies.set({
    name: "assessor_role",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
