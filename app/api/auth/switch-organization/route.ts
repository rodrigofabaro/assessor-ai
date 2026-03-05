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

function isOrgSchemaCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const message = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") return true;
  return (
    message.includes("organization") &&
    ((message.includes("table") && message.includes("does not exist")) ||
      (message.includes("column") && message.includes("does not exist")) ||
      message.includes("unknown argument"))
  );
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

  let org: { id: string; isActive: boolean } | null = null;
  try {
    org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, isActive: true },
    });
  } catch (error) {
    if (!isOrgSchemaCompatError(error)) throw error;
    return NextResponse.json(
      { error: "Organization switching is not available yet. Run database migrations.", code: "ORG_SCHEMA_MISSING" },
      { status: 409 },
    );
  }
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

  let user:
    | {
        id: string;
        role: string;
        platformRole: "USER" | "SUPER_ADMIN";
        isActive: boolean;
        organizationId: string | null;
        memberships: Array<{ role: "ORG_ADMIN" | "ASSESSOR" | "IV" | "VIEWER" }>;
      }
    | {
        id: string;
        role: string;
        isActive: boolean;
        organizationId: string | null;
      }
    | null = null;
  try {
    user = await prisma.appUser.findUnique({
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
  } catch (error) {
    if (!isOrgSchemaCompatError(error)) throw error;
    return NextResponse.json(
      { error: "Organization switching is not available yet. Run database migrations.", code: "ORG_SCHEMA_MISSING" },
      { status: 409 },
    );
  }

  if (!user?.isActive) {
    return NextResponse.json({ error: "User not found or inactive." }, { status: 404 });
  }

  const isSuperAdmin = ("platformRole" in user ? isSuperAdminPlatformRole(user.platformRole) : false) || !!session.isSuperAdmin;
  const membershipRole = "memberships" in user ? user.memberships[0]?.role || null : null;
  const legacyOrgAllowed = String(user.organizationId || "").trim() === organizationId;
  if (!isSuperAdmin && !membershipRole && !legacyOrgAllowed) {
    return NextResponse.json(
      { error: "You are not a member of this organization.", code: "ORG_MEMBERSHIP_REQUIRED" },
      { status: 403 }
    );
  }

  const role =
    resolveSessionRole({
      platformRole: "platformRole" in user ? user.platformRole : null,
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
