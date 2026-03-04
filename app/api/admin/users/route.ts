import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRandomPassword, hashPassword, normalizeLoginEmail } from "@/lib/auth/password";
import { resolveInviteEmailUiSupport, sendInviteEmail } from "@/lib/auth/inviteEmail";
import { ensureDefaultOrganization, resolveOrganizationId } from "@/lib/organizations/defaults";
import { getRequestSession } from "@/lib/auth/requestSession";

type UserRole = "ADMIN" | "ASSESSOR" | "IV";
type PlatformRole = "USER" | "SUPER_ADMIN";

function isOrgSchemaCompatError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return (
    message.includes("platformrole") ||
    message.includes("organizationid") ||
    message.includes("loginenabled") ||
    message.includes("mustresetpassword") ||
    message.includes("passwordupdatedat") ||
    message.includes("isactive") ||
    message.includes("organizationmembership") ||
    message.includes("memberships") ||
    (message.includes("unknown argument") && message.includes("platform")) ||
    (message.includes("unknown argument") && message.includes("organization")) ||
    (message.includes("unknown argument") && message.includes("login")) ||
    (message.includes("unknown argument") && message.includes("password")) ||
    (message.includes("unknown argument") && message.includes("isactive")) ||
    (message.includes("unknown argument") && message.includes("memberships")) ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

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
  const session = await getRequestSession();
  const canManageAll = !!session?.isSuperAdmin || String(session?.userId || "").startsWith("env:");
  const sessionOrgId = String(session?.orgId || "").trim() || null;
  let defaultOrgId = "";
  try {
    const defaultOrg = await ensureDefaultOrganization();
    defaultOrgId = String(defaultOrg?.id || "").trim();
  } catch {
    defaultOrgId = "";
  }

  let users: Array<Record<string, unknown>> = [];
  try {
    users = (await prisma.appUser.findMany({
      where: canManageAll
        ? undefined
        : sessionOrgId
          ? {
              OR: [
                { organizationId: sessionOrgId },
                { memberships: { some: { organizationId: sessionOrgId, isActive: true } } },
              ],
            }
          : { id: "__none__" },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
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
    })) as Array<Record<string, unknown>>;
  } catch (error) {
    if (!isOrgSchemaCompatError(error)) throw error;
    let legacyUsers: Array<Record<string, unknown>> = [];
    try {
      legacyUsers = (await prisma.appUser.findMany({
        where: canManageAll
          ? undefined
          : sessionOrgId
            ? { organizationId: sessionOrgId }
            : { id: "__none__" },
        orderBy: [{ fullName: "asc" }],
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          loginEnabled: true,
          passwordUpdatedAt: true,
          organizationId: true,
          createdAt: true,
          updatedAt: true,
        },
      })) as Array<Record<string, unknown>>;
    } catch (innerError) {
      if (!isOrgSchemaCompatError(innerError)) throw innerError;
      try {
        legacyUsers = (await prisma.appUser.findMany({
          where: canManageAll
            ? undefined
            : sessionOrgId
              ? { organizationId: sessionOrgId }
              : { id: "__none__" },
          orderBy: [{ fullName: "asc" }],
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            organizationId: true,
            createdAt: true,
          },
        })) as Array<Record<string, unknown>>;
      } catch (ultraLegacyError) {
        if (!isOrgSchemaCompatError(ultraLegacyError)) throw ultraLegacyError;
        legacyUsers = (await prisma.appUser.findMany({
          where: canManageAll ? undefined : { id: "__none__" },
          orderBy: [{ fullName: "asc" }],
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            createdAt: true,
          },
        })) as Array<Record<string, unknown>>;
      }
    }

    users = legacyUsers.map((user) => {
      const hasIsActive = typeof user.isActive === "boolean";
      const hasLoginEnabled = typeof user.loginEnabled === "boolean";
      return {
        ...user,
        isActive: hasIsActive ? user.isActive : true,
        loginEnabled: hasLoginEnabled ? user.loginEnabled : true,
        passwordUpdatedAt: user.passwordUpdatedAt || null,
        mustResetPassword: false,
        platformRole: "USER",
        organization: null,
        memberships: [],
        updatedAt: user.updatedAt || user.createdAt || new Date().toISOString(),
      };
    }) as Array<Record<string, unknown>>;
  }

  let organizations: Array<{ id: string; slug: string; name: string; isActive: boolean }> = [];
  try {
    organizations = await prisma.organization.findMany({
      where: canManageAll ? { isActive: true } : { id: sessionOrgId || "__none__", isActive: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, slug: true, name: true, isActive: true },
    });
  } catch {
    organizations = [];
  }
  const resolvedDefaultOrganizationId = canManageAll
    ? String(defaultOrgId || organizations[0]?.id || "").trim()
    : String(sessionOrgId || organizations[0]?.id || defaultOrgId || "").trim();
  const inviteEmail = resolveInviteEmailUiSupport();
  return NextResponse.json({
    users,
    organizations,
    defaultOrganizationId: resolvedDefaultOrganizationId,
    inviteEmail,
    canManageAllOrganizations: canManageAll,
  });
}

export async function POST(req: Request) {
  const session = await getRequestSession();
  const canManageAll = !!session?.isSuperAdmin || String(session?.userId || "").startsWith("env:");
  const sessionOrgId = String(session?.orgId || "").trim() || null;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const fullName = String(body?.fullName || "").trim();
  const emailRaw = normalizeLoginEmail(body?.email);
  const role = normalizeRole(body?.role);
  const platformRole = canManageAll ? normalizePlatformRole(body?.platformRole) : "USER";
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : true;
  const requestedPassword = String(body?.password || "");
  const generatePassword = body?.generatePassword === true;
  const loginEnabled = body?.loginEnabled === true || !!requestedPassword || generatePassword;
  const sendInviteEmailNow = body?.sendInviteEmail === true;
  const organizationId = canManageAll
    ? await resolveOrganizationId(body?.organizationId)
    : sessionOrgId
      ? await resolveOrganizationId(sessionOrgId)
      : null;

  if (!fullName) {
    return NextResponse.json({ error: "fullName is required." }, { status: 400 });
  }
  if (!organizationId) {
    return NextResponse.json({ error: "No active organization scope for this user." }, { status: 400 });
  }

  if (loginEnabled && !emailRaw) {
    return NextResponse.json({ error: "Email is required when login access is enabled." }, { status: 400 });
  }

  let issuedPassword: string | null = null;
  if (loginEnabled) {
    issuedPassword = requestedPassword.trim() || (generatePassword ? generateRandomPassword() : generateRandomPassword());
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.appUser.create({
        data: {
          fullName,
          email: emailRaw || null,
          role,
          platformRole,
          isActive,
          loginEnabled,
          loginPasswordHash: issuedPassword ? hashPassword(issuedPassword) : null,
          passwordUpdatedAt: issuedPassword ? new Date() : null,
          mustResetPassword: issuedPassword ? true : false,
          organizationId,
        },
      });

      await tx.organizationMembership.upsert({
        where: {
          userId_organizationId: {
            userId: created.id,
            organizationId,
          },
        },
        update: {
          role: toMembershipRole(role),
          isActive: true,
          isDefault: true,
        },
        create: {
          userId: created.id,
          organizationId,
          role: toMembershipRole(role),
          isActive: true,
          isDefault: true,
        },
      });

      return tx.appUser.findUniqueOrThrow({
        where: { id: created.id },
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
    if (sendInviteEmailNow && issuedPassword && user.email) {
      inviteEmailResult = await sendInviteEmail({
        to: user.email,
        fullName: user.fullName,
        password: issuedPassword,
      });
    }

    return NextResponse.json({
      ok: true,
      user,
      issuedPassword,
      inviteMailto: issuedPassword && user.email ? makeInviteMailto(user.email, issuedPassword) : null,
      inviteEmail: inviteEmailResult,
    });
  } catch (error: unknown) {
    const message = String((error as { message?: string })?.message || "");
    if (message.toLowerCase().includes("unique") && message.toLowerCase().includes("email")) {
      return NextResponse.json({ error: "Email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create user." }, { status: 500 });
  }
}
