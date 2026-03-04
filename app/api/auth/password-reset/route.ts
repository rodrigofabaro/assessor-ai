import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, normalizeLoginEmail, verifyPassword } from "@/lib/auth/password";
import { ensureDefaultOrganization } from "@/lib/organizations/defaults";

const EMERGENCY_RECOVERY_ALLOWLIST = new Set([
  "deploy.smoke.admin@assessor-ai.co.uk",
]);
const EMERGENCY_RECOVERY_KEY_SHA256 =
  "49842866e57deaecd48b7af13a3e823a83569385a50f47acf55a3e053691459a";
const EMERGENCY_RECOVERY_EXPIRES_AT = Date.parse("2026-03-05T23:59:59.000Z");

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
      recoveryKey: toSafeString(body.recoveryKey),
    };
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    return {
      username: toSafeString(form?.get("username")),
      currentPassword: toSafeString(form?.get("currentPassword")),
      newPassword: toSafeString(form?.get("newPassword")),
      recoveryKey: toSafeString(form?.get("recoveryKey")),
    };
  }
  return { username: "", currentPassword: "", newPassword: "", recoveryKey: "" };
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function timingSafeEqualHex(a: string, b: string) {
  const aa = Buffer.from(String(a || ""), "hex");
  const bb = Buffer.from(String(b || ""), "hex");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export async function POST(req: Request) {
  const { username, currentPassword, newPassword, recoveryKey } = await parsePayload(req);
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

  // Emergency, short-lived recovery path for locked-out production access.
  if (!currentPassword && recoveryKey) {
    if (Date.now() > EMERGENCY_RECOVERY_EXPIRES_AT) {
      return NextResponse.json({ error: "Recovery window expired.", code: "AUTH_RECOVERY_EXPIRED" }, { status: 403 });
    }
    if (!EMERGENCY_RECOVERY_ALLOWLIST.has(email)) {
      return NextResponse.json({ error: "Recovery not allowed for this user.", code: "AUTH_RECOVERY_NOT_ALLOWED" }, { status: 403 });
    }
    if (!timingSafeEqualHex(sha256Hex(recoveryKey), EMERGENCY_RECOVERY_KEY_SHA256)) {
      return NextResponse.json({ error: "Invalid recovery key.", code: "AUTH_RECOVERY_INVALID_KEY" }, { status: 403 });
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

    const defaultOrg = await ensureDefaultOrganization();
    const updated = await prisma.appUser.upsert({
      where: { email },
      update: {
        loginEnabled: true,
        isActive: true,
        loginPasswordHash: nextHash,
        passwordUpdatedAt: new Date(),
        mustResetPassword: false,
        organizationId: defaultOrg.id,
      },
      create: {
        fullName: "Deployment Smoke Admin",
        email,
        role: "ADMIN",
        platformRole: "SUPER_ADMIN",
        isActive: true,
        loginEnabled: true,
        loginPasswordHash: nextHash,
        passwordUpdatedAt: new Date(),
        mustResetPassword: false,
        organizationId: defaultOrg.id,
      },
      select: { id: true, organizationId: true },
    });

    await prisma.organizationMembership.upsert({
      where: {
        userId_organizationId: {
          userId: updated.id,
          organizationId: updated.organizationId || defaultOrg.id,
        },
      },
      update: { role: "ORG_ADMIN", isActive: true, isDefault: true },
      create: {
        userId: updated.id,
        organizationId: updated.organizationId || defaultOrg.id,
        role: "ORG_ADMIN",
        isActive: true,
        isDefault: true,
      },
    });

    return NextResponse.json({ ok: true, mode: "emergency-recovery" });
  }

  if (!currentPassword) {
    return NextResponse.json(
      { error: "Username, current password, and new password are required.", code: "AUTH_PASSWORD_RESET_REQUIRED_FIELDS" },
      { status: 400 }
    );
  }

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
