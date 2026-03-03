import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { findPolicyForPath, isAuthGuardsEnabled } from "@/lib/auth/rbac";
import { verifySignedSessionTokenEdge } from "@/lib/auth/sessionEdge";

const SESSION_COOKIE_NAME = "assessor_session";
const ALL_ROLES = ["ADMIN", "ASSESSOR", "IV"] as const;

async function resolveRole(req: NextRequest) {
  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value || "";
  const secret = String(process.env.AUTH_SESSION_SECRET || "").trim();
  if (!sessionToken || secret.length < 24) return null;
  const session = sessionToken ? await verifySignedSessionTokenEdge(sessionToken, secret) : null;
  return session?.role || null;
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function isPublicPath(pathname: string) {
  if (pathname === "/" || pathname.startsWith("/help") || pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/api/auth/login" || pathname === "/api/auth/logout") return true;
  if (pathname === "/api/auth/session/bootstrap" || pathname === "/api/auth/role-sync") return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (!isAuthGuardsEnabled()) return NextResponse.next();

  const isLoginPath = pathname === "/login" || pathname.startsWith("/login/");
  const role = await resolveRole(req);
  if (isLoginPath && role) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  const policy = findPolicyForPath(pathname);
  if (!role) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Authentication required.", code: "AUTH_REQUIRED", requiredRoles: policy?.allowedRoles || ALL_ROLES },
        { status: 401 }
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    const nextPath = `${pathname}${req.nextUrl.search || ""}`;
    if (nextPath) url.searchParams.set("next", nextPath);
    url.searchParams.set("auth", "required");
    return NextResponse.redirect(url);
  }

  if (!policy.allowedRoles.includes(role)) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Insufficient role.", code: "ROLE_FORBIDDEN", role, requiredRoles: policy.allowedRoles },
        { status: 403 }
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("auth", "forbidden");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
