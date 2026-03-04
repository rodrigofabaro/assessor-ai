import { NextResponse } from "next/server";
import { createSignedSessionToken, getSessionCookieName, hasSessionSecret } from "@/lib/auth/session";
import { getRequestSession } from "@/lib/auth/requestSession";
import { prisma } from "@/lib/prisma";
import { isSuperAdminPlatformRole, resolveSessionRole } from "@/lib/organizations/membership";

export const runtime = "nodejs";

const ONE_DAY_SECONDS = 60 * 60 * 24;

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  if (!hasSessionSecret()) {
    return NextResponse.json(
      { error: "AUTH_SESSION_SECRET is not configured.", code: "AUTH_SESSION_SECRET_MISSING" },
      { status: 503 }
    );
  }

  const session = await getRequestSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const organizationId = toSafeString(body?.organizationId);
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, isActive: true },
  });
  if (!org?.isActive) {
    return NextResponse.json({ error: "Organization not found or inactive." }, { status: 404 });
  }

  const isEnvSession = session.userId.startsWith("env:");
  if (isEnvSession) {
    const token = createSignedSessionToken({
      userId: session.userId,
      role: session.role,
      orgId: org.id,
      isSuperAdmin: true,
      ttlSeconds: ONE_DAY_SECONDS,
    });
    const res = NextResponse.json({
      ok: true,
      organizationId: org.id,
      role: session.role,
      isSuperAdmin: true,
      source: "env",
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

  const user = await prisma.appUser.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      role: true,
      platformRole: true,
      isActive: true,
      organizationId: true,
      memberships: {
        where: {
          organizationId,
          isActive: true,
          organization: { isActive: true },
        },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!user?.isActive) {
    return NextResponse.json({ error: "User not found or inactive." }, { status: 404 });
  }

  const isSuperAdmin = isSuperAdminPlatformRole(user.platformRole) || !!session.isSuperAdmin;
  const membershipRole = user.memberships[0]?.role || null;
  const legacyOrgAllowed = String(user.organizationId || "").trim() === organizationId;
  if (!isSuperAdmin && !membershipRole && !legacyOrgAllowed) {
    return NextResponse.json(
      { error: "You are not a member of this organization.", code: "ORG_MEMBERSHIP_REQUIRED" },
      { status: 403 }
    );
  }

  const role =
    resolveSessionRole({
      platformRole: user.platformRole,
      membershipRole: membershipRole || (legacyOrgAllowed ? "ORG_ADMIN" : undefined),
      legacyRole: user.role,
    }) || "ADMIN";

  const token = createSignedSessionToken({
    userId: user.id,
    role,
    orgId: org.id,
    isSuperAdmin,
    ttlSeconds: ONE_DAY_SECONDS,
  });

  const res = NextResponse.json({
    ok: true,
    organizationId: org.id,
    role,
    isSuperAdmin,
    source: membershipRole ? "membership" : "super-admin",
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
