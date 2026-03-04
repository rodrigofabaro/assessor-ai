import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/requestSession";
import { prisma } from "@/lib/prisma";
import { isSuperAdminPlatformRole } from "@/lib/organizations/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getRequestSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const activeOrganizationId = String(session.orgId || "").trim() || null;
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

  const user = await prisma.appUser.findUnique({
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

  if (!user?.isActive) {
    return NextResponse.json({ error: "User not found or inactive." }, { status: 404 });
  }

  const isSuperAdmin = isSuperAdminPlatformRole(user.platformRole) || !!session.isSuperAdmin;
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

  const organizations = (user.memberships || [])
    .map((row) => ({
      id: row.organization.id,
      slug: row.organization.slug,
      name: row.organization.name,
      isActive: row.organization.isActive,
      role: row.role,
      isDefault: row.isDefault,
    }))
    .filter((row) => row.isActive);

  if (!organizations.length && user.organization?.isActive) {
    organizations.push({
      id: user.organization.id,
      slug: user.organization.slug,
      name: user.organization.name,
      isActive: true,
      role: "ORG_ADMIN",
      isDefault: true,
    });
  }

  return NextResponse.json({
    organizations,
    activeOrganizationId,
    isSuperAdmin: false,
    source: "membership",
  });
}
