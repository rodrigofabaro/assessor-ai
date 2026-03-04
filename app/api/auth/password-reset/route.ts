import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, normalizeLoginEmail, verifyPassword } from "@/lib/auth/password";

export const runtime = "nodejs";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

async function parsePayload(req: Request) {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      username: toSafeString(body.username),
      currentPassword: toSafeString(body.currentPassword),
      newPassword: toSafeString(body.newPassword),
    };
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    return {
      username: toSafeString(form?.get("username")),
      currentPassword: toSafeString(form?.get("currentPassword")),
      newPassword: toSafeString(form?.get("newPassword")),
    };
  }
  return { username: "", currentPassword: "", newPassword: "" };
}

export async function POST(req: Request) {
  const { username, currentPassword, newPassword } = await parsePayload(req);
  if (!username || !currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Username, current password, and new password are required.", code: "AUTH_PASSWORD_RESET_REQUIRED_FIELDS" },
      { status: 400 }
    );
  }

  const email = normalizeLoginEmail(username);
  const user = await prisma.appUser.findFirst({
    where: { email, isActive: true, loginEnabled: true },
    select: { id: true, loginPasswordHash: true },
  });
  if (!user?.loginPasswordHash || !verifyPassword(currentPassword, user.loginPasswordHash)) {
    return NextResponse.json({ error: "Invalid credentials.", code: "AUTH_INVALID_CREDENTIALS" }, { status: 401 });
  }
  if (verifyPassword(newPassword, user.loginPasswordHash)) {
    return NextResponse.json(
      { error: "New password must be different from current password.", code: "AUTH_PASSWORD_RESET_SAME" },
      { status: 400 }
    );
  }

  let nextHash = "";
  try {
    nextHash = hashPassword(newPassword);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: String((error as { message?: string })?.message || "Invalid new password."), code: "AUTH_PASSWORD_RESET_INVALID" },
      { status: 400 }
    );
  }

  await prisma.appUser.update({
    where: { id: user.id },
    data: {
      loginPasswordHash: nextHash,
      passwordUpdatedAt: new Date(),
      mustResetPassword: false,
    },
  });

  return NextResponse.json({ ok: true });
}
