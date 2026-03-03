import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { findPolicyForPath, isAuthGuardsEnabled, parseRole } from "@/lib/auth/rbac";

function resolveRole(req: NextRequest) {
  return (
    parseRole(req.headers.get("x-assessor-role")) ||
    parseRole(req.headers.get("x-active-role")) ||
    parseRole(req.cookies.get("assessor_role")?.value) ||
    null
  );
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

export function middleware(req: NextRequest) {
  if (!isAuthGuardsEnabled()) return NextResponse.next();

  const pathname = req.nextUrl.pathname;
  const policy = findPolicyForPath(pathname);
  if (!policy) return NextResponse.next();

  const role = resolveRole(req);
  if (!role) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Authentication required.", code: "AUTH_REQUIRED", requiredRoles: policy.allowedRoles },
        { status: 401 }
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/";
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

