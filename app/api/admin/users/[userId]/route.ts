import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRandomPassword, hashPassword, normalizeLoginEmail } from "@/lib/auth/password";
import { sendInviteEmail } from "@/lib/auth/inviteEmail";

type UserRole = "ADMIN" | "ASSESSOR" | "IV";

function normalizeRole(value: unknown): UserRole {
  const role = String(value || "").trim().toUpperCase();
  if (role === "IV") return "IV";
  if (role === "ASSESSOR" || role === "TUTOR") return "ASSESSOR";
  return "ADMIN";
}

function makeInviteMailto(email: string, password: string) {
  const subject = encodeURIComponent("Assessor AI login access");
  const body = encodeURIComponent(
    [
      "Your Assessor AI account credentials were updated.",
      "",
      `Login URL: https://www.assessor-ai.co.uk/login`,
      `Username: ${email}`,
      `Password: ${password}`,
      "",
      "Please keep this password private.",
    ].join("\n")
  );
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const { userId } = await ctx.params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const fullName = body?.fullName !== undefined ? String(body.fullName || "").trim() : undefined;
  const email = body?.email !== undefined ? normalizeLoginEmail(body.email) : undefined;
  const role = body?.role !== undefined ? normalizeRole(body.role) : undefined;
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : undefined;
  const requestedPassword = body?.password !== undefined ? String(body.password || "") : undefined;
  const generatePassword = body?.generatePassword === true;
  const loginEnabled = typeof body?.loginEnabled === "boolean" ? body.loginEnabled : undefined;
  const sendInviteEmailNow = body?.sendInviteEmail === true;

  if (fullName !== undefined && !fullName) {
    return NextResponse.json({ error: "fullName cannot be empty." }, { status: 400 });
  }

  const existing = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { id: true, email: true, loginEnabled: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const nextEmail = email === undefined ? existing.email : email || null;
  const nextLoginEnabled = loginEnabled === undefined ? existing.loginEnabled : loginEnabled;

  let issuedPassword: string | null = null;
  if (requestedPassword !== undefined) {
    issuedPassword = requestedPassword.trim();
  } else if (generatePassword) {
    issuedPassword = generateRandomPassword();
  }

  if ((nextLoginEnabled || issuedPassword) && !nextEmail) {
    return NextResponse.json({ error: "Email is required when login access is enabled." }, { status: 400 });
  }

  let loginPasswordHash: string | null | undefined;
  let passwordUpdatedAt: Date | null | undefined;
  if (issuedPassword !== null) {
    loginPasswordHash = hashPassword(issuedPassword);
    passwordUpdatedAt = new Date();
  } else if (loginEnabled === false) {
    loginPasswordHash = null;
    passwordUpdatedAt = null;
  }

  try {
    const updated = await prisma.appUser.update({
      where: { id: userId },
      data: {
        fullName,
        email: email === undefined ? undefined : email || null,
        role,
        isActive,
        loginEnabled,
        loginPasswordHash,
        passwordUpdatedAt,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        loginEnabled: true,
        passwordUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    let inviteEmailResult:
      | {
          attempted: boolean;
          sent: boolean;
          provider: string;
          id?: string;
          error?: string;
        }
      | null = null;
    if (sendInviteEmailNow && issuedPassword && updated.email) {
      inviteEmailResult = await sendInviteEmail({
        to: updated.email,
        fullName: updated.fullName,
        password: issuedPassword,
      });
    }

    return NextResponse.json({
      ok: true,
      user: updated,
      issuedPassword,
      inviteMailto: issuedPassword && updated.email ? makeInviteMailto(updated.email, issuedPassword) : null,
      inviteEmail: inviteEmailResult,
    });
  } catch (error: unknown) {
    const message = String((error as { message?: string })?.message || "");
    if (message.toLowerCase().includes("unique") && message.toLowerCase().includes("email")) {
      return NextResponse.json({ error: "Email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update user." }, { status: 500 });
  }
}
