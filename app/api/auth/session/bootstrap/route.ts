import { NextResponse } from "next/server";
import { getOrCreateAppConfig } from "@/lib/admin/appConfig";
import { createSignedSessionToken, getSessionCookieName, hasSessionSecret } from "@/lib/auth/session";
import { parseRole } from "@/lib/auth/rbac";

export const runtime = "nodejs";

const ONE_DAY_SECONDS = 60 * 60 * 24;

export async function POST() {
  if (!hasSessionSecret()) {
    return NextResponse.json(
      { error: "AUTH_SESSION_SECRET is not configured.", code: "AUTH_SESSION_SECRET_MISSING" },
      { status: 503 }
    );
  }

  const cfg = await getOrCreateAppConfig();
  const user = cfg.activeAuditUser;
  const role = parseRole(user?.isActive ? user.role : null);

  const res = NextResponse.json({
    ok: true,
    userId: user?.id || null,
    role: role || null,
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

