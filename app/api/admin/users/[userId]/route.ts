import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRandomPassword, hashPassword, normalizeLoginEmail } from "@/lib/auth/password";
import { sendInviteEmail } from "@/lib/auth/inviteEmail";
import { resolveOrganizationId } from "@/lib/organizations/defaults";
import { getRequestSession } from "@/lib/auth/requestSession";

type UserRole = "ADMIN" | "ASSESSOR" | "IV";
type PlatformRole = "USER" | "SUPER_ADMIN";

function normalizeRole(value: unknown): UserRole {
  const role = String(value || "").trim().toUpperCase();
  if (role === "IV") return "IV";
  if (role === "ASSESSOR" || role === "TUTOR") return "ASSESSOR";
  return "ADMIN";
}

function normalizePlatformRole(value: unknown): PlatformRole {
  return String(value || "").trim().toUpperCase() === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER";
}

function toMembershipRole(role: UserRole): "ORG_ADMIN" | "ASSESSOR" | "IV" {
  if (role === "ADMIN") return "ORG_ADMIN";
  if (role === "IV") return "IV";
  return "ASSESSOR";
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
  const session = await getRequestSession();
  const canManageAll = !!session?.isSuperAdmin || String(session?.userId || "").startsWith("env:");
  const sessionOrgId = String(session?.orgId || "").trim() || null;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const fullName = body?.fullName !== undefined ? String(body.fullName || "").trim() : undefined;
  const email = body?.email !== undefined ? normalizeLoginEmail(body.email) : undefined;
  const role = body?.role !== undefined ? normalizeRole(body.role) : undefined;
  const requestedPlatformRole = body?.platformRole !== undefined ? normalizePlatformRole(body.platformRole) : undefined;
  const platformRole = canManageAll ? requestedPlatformRole : undefined;
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : undefined;
  const requestedPassword = body?.password !== undefined ? String(body.password || "") : undefined;
  const generatePassword = body?.generatePassword === true;
  const loginEnabled = typeof body?.loginEnabled === "boolean" ? body.loginEnabled : undefined;
  const sendInviteEmailNow = body?.sendInviteEmail === true;
  if (!canManageAll && requestedPlatformRole === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only SUPER_ADMIN can grant SUPER_ADMIN." }, { status: 403 });
  }
  const organizationId = body?.organizationId !== undefined
    ? canManageAll
      ? await resolveOrganizationId(body.organizationId)
      : sessionOrgId
        ? await resolveOrganizationId(sessionOrgId)
        : undefined
    : undefined;

  if (fullName !== undefined && !fullName) {
    return NextResponse.json({ error: "fullName cannot be empty." }, { status: 400 });
  }

  const existing = await prisma.appUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      organizationId: true,
      loginEnabled: true,
      mustResetPassword: true,
      memberships: {
        where: { isActive: true },
        select: { organizationId: true },
      },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (!canManageAll) {
    if (!sessionOrgId) {
      return NextResponse.json({ error: "No active organization scope for this user." }, { status: 400 });
    }
    const inScope =
      String(existing.organizationId || "").trim() === sessionOrgId ||
      existing.memberships.some((m) => String(m.organizationId || "").trim() === sessionOrgId);
    if (!inScope) {
      return NextResponse.json({ error: "You can only manage users within your organization." }, { status: 403 });
    }
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
  let mustResetPassword: boolean | undefined;
  if (issuedPassword !== null) {
    loginPasswordHash = hashPassword(issuedPassword);
    passwordUpdatedAt = new Date();
    mustResetPassword = true;
  } else if (loginEnabled === false) {
    loginPasswordHash = null;
    passwordUpdatedAt = null;
    mustResetPassword = false;
  }

  try {
    const membershipRole = toMembershipRole(role || normalizeRole(existing.role));
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.appUser.update({
        where: { id: userId },
        data: {
          fullName,
          email: email === undefined ? undefined : email || null,
          role,
          platformRole,
          isActive,
          organizationId,
          loginEnabled,
          loginPasswordHash,
          passwordUpdatedAt,
          mustResetPassword,
        },
      });

      if (organizationId) {
        await tx.organizationMembership.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
        await tx.organizationMembership.upsert({
          where: { userId_organizationId: { userId, organizationId } },
          update: {
            role: membershipRole,
            isActive: true,
            isDefault: true,
          },
          create: {
            userId,
            organizationId,
            role: membershipRole,
            isActive: true,
            isDefault: true,
          },
        });
      } else if (role) {
        await tx.organizationMembership.updateMany({
          where: { userId },
          data: { role: membershipRole },
        });
      }

      return tx.appUser.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          loginEnabled: true,
          passwordUpdatedAt: true,
          mustResetPassword: true,
          platformRole: true,
          organizationId: true,
          organization: { select: { id: true, slug: true, name: true, isActive: true } },
          memberships: {
            where: { isActive: true, organization: { isActive: true } },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            select: {
              organizationId: true,
              role: true,
              isDefault: true,
              organization: { select: { id: true, slug: true, name: true, isActive: true } },
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });
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

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const { userId } = await ctx.params;
  const session = await getRequestSession();
  const canManageAll = !!session?.isSuperAdmin || String(session?.userId || "").startsWith("env:");
  const sessionOrgId = String(session?.orgId || "").trim() || null;

  if (String(session?.userId || "").trim() === userId) {
    return NextResponse.json({ error: "You cannot delete your own active account." }, { status: 400 });
  }

  const existing = await prisma.appUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      organizationId: true,
      memberships: {
        where: { isActive: true },
        select: { organizationId: true },
      },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (!canManageAll) {
    if (!sessionOrgId) {
      return NextResponse.json({ error: "No active organization scope for this user." }, { status: 400 });
    }
    const inScope =
      String(existing.organizationId || "").trim() === sessionOrgId ||
      existing.memberships.some((m) => String(m.organizationId || "").trim() === sessionOrgId);
    if (!inScope) {
      return NextResponse.json({ error: "You can only manage users within your organization." }, { status: 403 });
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.appConfig.updateMany({
        where: { activeAuditUserId: userId },
        data: { activeAuditUserId: null },
      });
      await tx.appUser.delete({
        where: { id: userId },
      });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete user." }, { status: 500 });
  }
}
