import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/requestSession";
import { prisma } from "@/lib/prisma";
import { isSuperAdminPlatformRole } from "@/lib/organizations/membership";
import { ensureUserOrganizationScope } from "@/lib/organizations/userScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrgRow = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  role?: string;
  isDefault?: boolean;
};

function isOrgSchemaCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const message = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") return true;
  return (
    message.includes("platformrole") ||
    message.includes("organizationmembership") ||
    message.includes("memberships") ||
    message.includes("organizationid") ||
    (message.includes("unknown argument") && message.includes("platform")) ||
    (message.includes("unknown argument") && message.includes("membership")) ||
    (message.includes("unknown argument") && message.includes("organization")) ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("table") && message.includes("does not exist"))
  );
}

function mapAppRoleToMembershipRole(appRole: string | null | undefined) {
  const role = String(appRole || "").trim().toUpperCase();
  if (role === "ADMIN") return "ORG_ADMIN";
  if (role === "IV") return "IV";
  return "ASSESSOR";
}

export async function GET() {
  const session = await getRequestSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  let activeOrganizationId = String(session.orgId || "").trim() || null;
  const isEnvSession = session.userId.startsWith("env:");

  if (isEnvSession) {
    const organizations = await prisma.organization.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, slug: true, name: true, isActive: true },
    });
    return NextResponse.json({
      organizations,
      activeOrganizationId,
      isSuperAdmin: true,
      source: "env",
    });
  }

  let user:
    | {
        id: string;
        isActive: boolean;
        platformRole: "USER" | "SUPER_ADMIN";
        organizationId: string | null;
        organization: { id: string; slug: string; name: string; isActive: boolean } | null;
        memberships: Array<{
          role: "ORG_ADMIN" | "ASSESSOR" | "IV" | "VIEWER";
          isDefault: boolean;
          organization: { id: string; slug: string; name: string; isActive: boolean };
        }>;
      }
    | {
        id: string;
        isActive: boolean;
        organizationId: string | null;
      }
    | null = null;

  try {
    user = await prisma.appUser.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        isActive: true,
        platformRole: true,
        organizationId: true,
        organization: { select: { id: true, slug: true, name: true, isActive: true } },
        memberships: {
          where: { isActive: true, organization: { isActive: true } },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: {
            role: true,
            isDefault: true,
            organization: { select: { id: true, slug: true, name: true, isActive: true } },
          },
        },
      },
    });
  } catch (error) {
    if (!isOrgSchemaCompatError(error)) throw error;
    try {
      user = await prisma.appUser.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          isActive: true,
          organizationId: true,
        },
      });
    } catch (innerError) {
      if (!isOrgSchemaCompatError(innerError)) throw innerError;
      const legacyUser = await prisma.appUser.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          organizationId: true,
        },
      });
      user = legacyUser ? { ...legacyUser, isActive: true } : null;
    }
  }

  if (!user?.isActive) {
    return NextResponse.json({ error: "User not found or inactive." }, { status: 404 });
  }

  const isSuperAdmin =
    ("platformRole" in user ? isSuperAdminPlatformRole(user.platformRole) : false) || !!session.isSuperAdmin;
  if (isSuperAdmin) {
    const organizations = await prisma.organization.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, slug: true, name: true, isActive: true },
    });
    return NextResponse.json({
      organizations,
      activeOrganizationId,
      isSuperAdmin: true,
      source: "super-admin",
    });
  }

  const organizations: OrgRow[] = ("memberships" in user ? user.memberships || [] : [])
    .map((row) => ({
      id: row.organization.id,
      slug: row.organization.slug,
      name: row.organization.name,
      isActive: row.organization.isActive,
      role: row.role,
      isDefault: row.isDefault,
    }))
    .filter((row) => row.isActive);

  if (!organizations.length && "organization" in user && user.organization?.isActive) {
    organizations.push({
      id: user.organization.id,
      slug: user.organization.slug,
      name: user.organization.name,
      isActive: true,
      role: "ORG_ADMIN",
      isDefault: true,
    });
  }

  if (!organizations.length) {
    const fallbackOrgId = String(user.organizationId || "").trim();
    if (fallbackOrgId) {
      const scopedOrg = await prisma.organization
        .findUnique({
          where: { id: fallbackOrgId },
          select: { id: true, slug: true, name: true, isActive: true },
        })
        .catch(() => null);
      if (scopedOrg?.isActive) {
        organizations.push({
          id: scopedOrg.id,
          slug: scopedOrg.slug,
          name: scopedOrg.name,
          isActive: true,
          role: mapAppRoleToMembershipRole(session.role),
          isDefault: true,
        });
        if (!activeOrganizationId) activeOrganizationId = scopedOrg.id;
      }
    }
  }

  if (!organizations.length) {
    try {
      const ensured = await ensureUserOrganizationScope({
        userId: user.id,
        appRole: session.role,
        preferredOrgId: activeOrganizationId,
      });
      const ensuredOrgId = String(ensured.orgId || "").trim();
      if (ensuredOrgId) {
        const ensuredOrg = await prisma.organization.findUnique({
          where: { id: ensuredOrgId },
          select: { id: true, slug: true, name: true, isActive: true },
        });
        if (ensuredOrg?.isActive) {
          organizations.push({
            id: ensuredOrg.id,
            slug: ensuredOrg.slug,
            name: ensuredOrg.name,
            isActive: true,
            role: "ORG_ADMIN",
            isDefault: true,
          });
          if (!activeOrganizationId) activeOrganizationId = ensuredOrg.id;
        }
      }
    } catch {
      // keep organizations response non-blocking
    }
  }

  return NextResponse.json({
    organizations,
    activeOrganizationId,
    isSuperAdmin: false,
    source: "membership",
  });
}
