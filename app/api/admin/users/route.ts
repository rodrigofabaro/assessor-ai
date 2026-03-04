import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRandomPassword, hashPassword, normalizeLoginEmail } from "@/lib/auth/password";

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
      "Your Assessor AI account is ready.",
      "",
      `Login URL: https://www.assessor-ai.co.uk/login`,
      `Username: ${email}`,
      `Password: ${password}`,
      "",
      "Please sign in and keep this password private.",
    ].join("\n")
  );
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

export async function GET() {
  const users = await prisma.appUser.findMany({
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
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
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const fullName = String(body?.fullName || "").trim();
  const emailRaw = normalizeLoginEmail(body?.email);
  const role = normalizeRole(body?.role);
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : true;
  const requestedPassword = String(body?.password || "");
  const generatePassword = body?.generatePassword === true;
  const loginEnabled = body?.loginEnabled === true || !!requestedPassword || generatePassword;

  if (!fullName) {
    return NextResponse.json({ error: "fullName is required." }, { status: 400 });
  }

  if (loginEnabled && !emailRaw) {
    return NextResponse.json({ error: "Email is required when login access is enabled." }, { status: 400 });
  }

  let issuedPassword: string | null = null;
  if (loginEnabled) {
    issuedPassword = requestedPassword.trim() || (generatePassword ? generateRandomPassword() : generateRandomPassword());
  }

  try {
    const user = await prisma.appUser.create({
      data: {
        fullName,
        email: emailRaw || null,
        role,
        isActive,
        loginEnabled,
        loginPasswordHash: issuedPassword ? hashPassword(issuedPassword) : null,
        passwordUpdatedAt: issuedPassword ? new Date() : null,
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
    return NextResponse.json({
      ok: true,
      user,
      issuedPassword,
      inviteMailto: issuedPassword && user.email ? makeInviteMailto(user.email, issuedPassword) : null,
    });
  } catch (error: unknown) {
    const message = String((error as { message?: string })?.message || "");
    if (message.toLowerCase().includes("unique") && message.toLowerCase().includes("email")) {
      return NextResponse.json({ error: "Email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create user." }, { status: 500 });
  }
}
