import { NextResponse } from "next/server";
import { getOrCreateAppConfig } from "@/lib/admin/appConfig";
import { createSignedSessionToken, getSessionCookieName, hasSessionSecret } from "@/lib/auth/session";
import { ensureDefaultOrganization } from "@/lib/organizations/defaults";
import { prisma } from "@/lib/prisma";
import {
  isSuperAdminPlatformRole,
  pickDefaultMembership,
  resolveSessionRole,
} from "@/lib/organizations/membership";

export const runtime = "nodejs";

const ONE_DAY_SECONDS = 60 * 60 * 24;
const allowBootstrap = /^(1|true|yes|on)$/i.test(String(process.env.AUTH_BOOTSTRAP_ENABLED || "false").trim());

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
  const user = activeAuditUserId
    ? await prisma.appUser.findUnique({
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
      })
    : null;
  const primaryMembership = pickDefaultMembership(user?.memberships || []);
  const role = resolveSessionRole({
    platformRole: user?.platformRole,
    membershipRole: primaryMembership?.role,
    legacyRole: user?.isActive ? user.role : null,
  });
  const isSuperAdmin = isSuperAdminPlatformRole(user?.platformRole);
  const defaultOrg = await ensureDefaultOrganization();
  const orgId =
    String(primaryMembership?.organizationId || user?.organizationId || defaultOrg.id || "").trim() || null;

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
