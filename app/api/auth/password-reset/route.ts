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

function isAppUserSchemaCompatError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return (
    message.includes("loginenabled") ||
    message.includes("mustresetpassword") ||
    message.includes("passwordupdatedat") ||
    message.includes("platformrole") ||
    message.includes("organizationmembership") ||
    message.includes("memberships") ||
    message.includes("unknown argument") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

export async function POST(req: Request) {
  try {
    const { username, currentPassword, newPassword } = await parsePayload(req);
    if (!username || !newPassword) {
      return NextResponse.json(
        { error: "Username and new password are required.", code: "AUTH_PASSWORD_RESET_REQUIRED_FIELDS" },
        { status: 400 }
      );
    }

    const email = normalizeLoginEmail(username);
    if (!email) {
      return NextResponse.json({ error: "Invalid username.", code: "AUTH_INVALID_CREDENTIALS" }, { status: 401 });
    }

    if (!currentPassword) {
      return NextResponse.json(
        { error: "Username, current password, and new password are required.", code: "AUTH_PASSWORD_RESET_REQUIRED_FIELDS" },
        { status: 400 }
      );
    }

    let user: { id: string; loginPasswordHash: string | null } | null = null;
    try {
      user = await prisma.appUser.findFirst({
        where: { email, isActive: true, loginEnabled: true },
        select: { id: true, loginPasswordHash: true },
      });
    } catch (error) {
      if (!isAppUserSchemaCompatError(error)) throw error;
      user = await prisma.appUser.findFirst({
        where: { email },
        select: { id: true, loginPasswordHash: true },
      });
    }
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

    try {
      await prisma.appUser.update({
        where: { id: user.id },
        data: {
          loginPasswordHash: nextHash,
          passwordUpdatedAt: new Date(),
          mustResetPassword: false,
        },
      });
    } catch (error) {
      if (!isAppUserSchemaCompatError(error)) throw error;
      await prisma.appUser.update({
        where: { id: user.id },
        data: {
          loginPasswordHash: nextHash,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: String((error as { message?: string })?.message || "Password reset failed."),
        code: "AUTH_PASSWORD_RESET_INTERNAL",
      },
      { status: 500 }
    );
  }
}
