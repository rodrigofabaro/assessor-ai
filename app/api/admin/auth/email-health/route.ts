import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/requestSession";
import { getAuthEmailReadiness } from "@/lib/auth/inviteEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getRequestSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });
  }
  if (session.role !== "ADMIN" && !session.isSuperAdmin) {
    return NextResponse.json({ error: "Admin role required.", code: "ROLE_FORBIDDEN" }, { status: 403 });
  }

  const readiness = getAuthEmailReadiness();
  return NextResponse.json({
    ok: true,
    readiness,
    checkedAt: new Date().toISOString(),
  });
}

