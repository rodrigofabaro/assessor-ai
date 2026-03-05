import { prisma } from "@/lib/prisma";
import { ensureDefaultOrganization } from "@/lib/organizations/defaults";

type MembershipRole = "ORG_ADMIN" | "ASSESSOR" | "IV" | "VIEWER";

function toMembershipRoleFromAppRole(role: unknown): MembershipRole {
  const normalized = String(role || "").trim().toUpperCase();
  if (normalized === "ADMIN") return "ORG_ADMIN";
  if (normalized === "IV") return "IV";
  return "ASSESSOR";
}

function isOrgScopeCompatError(error: unknown) {
  const message = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  return (
    message.includes("organizationmembership") ||
    message.includes("memberships") ||
    message.includes("organizationid") ||
    (message.includes("unknown argument") && message.includes("membership")) ||
    (message.includes("unknown argument") && message.includes("organization")) ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

export async function ensureUserOrganizationScope(input: {
  userId: string;
  appRole?: unknown;
  preferredOrgId?: string | null;
}) {
  const userId = String(input.userId || "").trim();
  if (!userId) return { orgId: null as string | null, linked: false };

  const preferredOrgId = String(input.preferredOrgId || "").trim() || null;
  const defaultOrg = await ensureDefaultOrganization().catch(() => null);

  let user:
    | {
        id: string;
        organizationId: string | null;
        memberships: Array<{ organizationId: string; isDefault: boolean; isActive: boolean }>;
      }
    | {
        id: string;
        organizationId: string | null;
      }
    | null = null;

  try {
    user = await prisma.appUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        organizationId: true,
        memberships: {
          where: { isActive: true, organization: { isActive: true } },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: {
            organizationId: true,
            isDefault: true,
            isActive: true,
          },
        },
      },
    });
  } catch (error) {
    if (!isOrgScopeCompatError(error)) throw error;
    try {
      user = await prisma.appUser.findUnique({
        where: { id: userId },
        select: {
          id: true,
          organizationId: true,
        },
      });
    } catch (innerError) {
      if (!isOrgScopeCompatError(innerError)) throw innerError;
      const legacyUser = await prisma.appUser.findUnique({
        where: { id: userId },
        select: {
          id: true,
        },
      });
      user = legacyUser ? { ...legacyUser, organizationId: null } : null;
    }
  }

  if (!user) {
    return {
      orgId: preferredOrgId || defaultOrg?.id || null,
      linked: false,
    };
  }

  const memberships = "memberships" in user ? (Array.isArray(user.memberships) ? user.memberships : []) : [];
  const defaultMembership = memberships.find((row) => !!row.isDefault) || memberships[0] || null;
  const resolvedOrgId =
    String(defaultMembership?.organizationId || user.organizationId || preferredOrgId || defaultOrg?.id || "").trim() || null;

  if (!resolvedOrgId) return { orgId: null as string | null, linked: false };

  const hasOrgId = !!String(user.organizationId || "").trim();
  const hasMembership = memberships.some((row) => String(row.organizationId || "").trim() === resolvedOrgId);
  const hasDefaultMembership = memberships.some((row) => !!row.isDefault);

  if (hasOrgId && (memberships.length === 0 || (hasMembership && hasDefaultMembership))) {
    return { orgId: resolvedOrgId, linked: false };
  }

  const membershipRole = toMembershipRoleFromAppRole(input.appRole);
  let linked = false;

  try {
    await prisma.$transaction(async (tx) => {
      if (!hasOrgId) {
        await tx.appUser.update({
          where: { id: userId },
          data: { organizationId: resolvedOrgId },
        });
        linked = true;
      }

      try {
        if (!hasMembership) {
          await tx.organizationMembership.create({
            data: {
              userId,
              organizationId: resolvedOrgId,
              role: membershipRole,
              isActive: true,
              isDefault: !hasDefaultMembership,
            },
          });
          linked = true;
        } else {
          await tx.organizationMembership.updateMany({
            where: { userId, organizationId: resolvedOrgId },
            data: {
              role: membershipRole,
              isActive: true,
              ...(hasDefaultMembership ? {} : { isDefault: true }),
            },
          });
          if (!hasDefaultMembership) linked = true;
        }

        if (!hasDefaultMembership) {
          await tx.organizationMembership.updateMany({
            where: { userId, NOT: { organizationId: resolvedOrgId } },
            data: { isDefault: false },
          });
        }
      } catch (error) {
        if (!isOrgScopeCompatError(error)) throw error;
      }
    });
  } catch (error) {
    if (!isOrgScopeCompatError(error)) throw error;
  }

  return { orgId: resolvedOrgId, linked };
}
