import { NextResponse } from "next/server";
import { getOrCreateAppConfig } from "@/lib/admin/appConfig";

export const runtime = "nodejs";

const COOKIE_NAME = "assessor_role";
const ONE_DAY_SECONDS = 60 * 60 * 24;

function normalizeRole(value: string | null | undefined) {
  const role = String(value || "").trim().toUpperCase();
  if (role === "ADMIN" || role === "ASSESSOR" || role === "IV") return role;
  return "";
}

export async function POST() {
  const cfg = await getOrCreateAppConfig();
  const active = cfg.activeAuditUser;
  const role = active?.isActive ? normalizeRole(active.role) : "";

  const res = NextResponse.json({
    ok: true,
    role: role || null,
    source: active?.isActive ? "active-audit-user" : "none",
  });

  if (role) {
    res.cookies.set({
      name: COOKIE_NAME,
      value: role,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_DAY_SECONDS,
    });
  } else {
    res.cookies.set({
      name: COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }

  return res;
}

