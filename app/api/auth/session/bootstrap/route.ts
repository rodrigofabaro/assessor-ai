import { NextResponse } from "next/server";
import { getOrCreateAppConfig } from "@/lib/admin/appConfig";
import { createSignedSessionToken, getSessionCookieName, hasSessionSecret } from "@/lib/auth/session";
import { ensureDefaultOrganization, ensureSuperAdminOrganization } from "@/lib/organizations/defaults";
import { prisma } from "@/lib/prisma";
import {
  isSuperAdminPlatformRole,
  pickDefaultMembership,
  resolveSessionRole,
} from "@/lib/organizations/membership";
import { ensureUserOrganizationScope } from "@/lib/organizations/userScope";

export const runtime = "nodejs";

const ONE_DAY_SECONDS = 60 * 60 * 24;
const allowBootstrap = /^(1|true|yes|on)$/i.test(String(process.env.AUTH_BOOTSTRAP_ENABLED || "false").trim());

function isOrgSchemaCompatError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return (
    message.includes("platformrole") ||
    message.includes("organizationmembership") ||
    message.includes("memberships") ||
    (message.includes("unknown argument") && message.includes("platform")) ||
    (message.includes("unknown argument") && message.includes("memberships")) ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

export async function POST() {
  if (!allowBootstrap) {
    return NextResponse.json({ error: "Session bootstrap is disabled.", code: "AUTH_BOOTSTRAP_DISABLED" }, { status: 403 });
  }
  if (!hasSessionSecret()) {
    return NextResponse.json(
      { error: "AUTH_SESSION_SECRET is not configured.", code: "AUTH_SESSION_SECRET_MISSING" },
      { status: 503 }
    );
  }

  const cfg = await getOrCreateAppConfig();
  const activeAuditUserId = String(cfg.activeAuditUser?.id || "").trim();
  let user:
    | {
        id: string;
        isActive: boolean;
        role: string;
        platformRole: "USER" | "SUPER_ADMIN";
        organizationId: string | null;
        memberships: Array<{ organizationId: string; role: "ORG_ADMIN" | "ASSESSOR" | "IV" | "VIEWER"; isDefault: boolean }>;
      }
    | {
        id: string;
        isActive: boolean;
        role: string;
        organizationId: string | null;
      }
    | null = null;
  if (activeAuditUserId) {
    try {
      user = await prisma.appUser.findUnique({
        where: { id: activeAuditUserId },
        select: {
          id: true,
          isActive: true,
          role: true,
          platformRole: true,
          organizationId: true,
          memberships: {
            where: { isActive: true, organization: { isActive: true } },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            select: { organizationId: true, role: true, isDefault: true },
          },
        },
      });
    } catch (error) {
      if (!isOrgSchemaCompatError(error)) throw error;
      try {
        user = await prisma.appUser.findUnique({
          where: { id: activeAuditUserId },
          select: {
            id: true,
            isActive: true,
            role: true,
            organizationId: true,
          },
        });
      } catch (innerError) {
        if (!isOrgSchemaCompatError(innerError)) throw innerError;
        const legacyUser = await prisma.appUser.findUnique({
          where: { id: activeAuditUserId },
          select: {
            id: true,
            isActive: true,
            role: true,
          },
        });
        user = legacyUser ? { ...legacyUser, organizationId: null } : null;
      }
    }
  }
  const primaryMembership = pickDefaultMembership(user && "memberships" in user ? user.memberships || [] : []);
  const role = resolveSessionRole({
    platformRole: user && "platformRole" in user ? user.platformRole : null,
    membershipRole: primaryMembership?.role,
    legacyRole: user?.isActive ? user.role : null,
  });
  const isSuperAdmin = isSuperAdminPlatformRole(user && "platformRole" in user ? user.platformRole : null);
  const defaultOrg = await ensureDefaultOrganization();
  let orgId =
    String(primaryMembership?.organizationId || user?.organizationId || defaultOrg.id || "").trim() || null;
  let superAdminOrgId: string | null = null;

  if (isSuperAdmin) {
    const superAdminOrg = await ensureSuperAdminOrganization().catch(() => null);
    superAdminOrgId = String(superAdminOrg?.id || "").trim() || null;
    if (superAdminOrgId) orgId = superAdminOrgId;
  }

  if (user?.isActive && role) {
    try {
      const ensured = await ensureUserOrganizationScope({
        userId: user.id,
        appRole: role,
        preferredOrgId: orgId,
      });
      if (superAdminOrgId) {
        orgId = superAdminOrgId;
      } else if (String(ensured.orgId || "").trim()) {
        orgId = String(ensured.orgId || "").trim();
      }
    } catch {
      // keep bootstrap non-blocking
    }
  }

  const res = NextResponse.json({
    ok: true,
    userId: user?.id || null,
    role: role || null,
    orgId,
    isSuperAdmin,
    source: user?.isActive ? "active-audit-user" : "none",
  });

  if (!user?.isActive || !role) {
    res.cookies.set({
      name: getSessionCookieName(),
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  const token = createSignedSessionToken({
    userId: user.id,
    role,
    orgId,
    isSuperAdmin,
    ttlSeconds: ONE_DAY_SECONDS,
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
  return res;
}
