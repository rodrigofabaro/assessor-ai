import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/requestSession";
import { getAuthEmailReadiness, sendAuthTestEmail } from "@/lib/auth/inviteEmail";

export const runtime = "nodejs";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  const session = await getRequestSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });
  }
  if (session.role !== "ADMIN" && !session.isSuperAdmin) {
    return NextResponse.json({ error: "Admin role required.", code: "ROLE_FORBIDDEN" }, { status: 403 });
  }

  const readiness = getAuthEmailReadiness();
  if (!readiness.configured) {
    return NextResponse.json(
      {
        error: "Email provider is not configured.",
        code: "AUTH_EMAIL_NOT_CONFIGURED",
        readiness,
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const to = toSafeString(body.to).toLowerCase();
  if (!to) {
    return NextResponse.json({ error: "Recipient email is required.", code: "AUTH_EMAIL_TEST_REQUIRED_TO" }, { status: 400 });
  }

  const result = await sendAuthTestEmail({ to });
  if (!result.sent) {
    return NextResponse.json(
      {
        error: String(result.error || "Test email failed.").trim(),
        code: "AUTH_EMAIL_TEST_FAILED",
        provider: result.provider,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    provider: result.provider,
    id: result.id || null,
  });
}

