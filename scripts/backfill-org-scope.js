const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEFAULT_ORG = {
  id: "org_default",
  slug: "default",
  name: "Default Organization",
};

function membershipRoleFromAppRole(role) {
  const normalized = String(role || "").trim().toUpperCase();
  if (normalized === "ADMIN") return "ORG_ADMIN";
  if (normalized === "IV") return "IV";
  return "ASSESSOR";
}

function isCompatError(error) {
  const message = String((error && error.message) || error || "").toLowerCase();
  return (
    message.includes("organizationmembership") ||
    message.includes("memberships") ||
    message.includes("organizationid") ||
    (message.includes("unknown argument") && message.includes("membership")) ||
    (message.includes("unknown argument") && message.includes("organization")) ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

async function ensureDefaultOrg() {
  try {
    return await prisma.organization.upsert({
      where: { slug: DEFAULT_ORG.slug },
      update: {},
      create: {
        id: DEFAULT_ORG.id,
        slug: DEFAULT_ORG.slug,
        name: DEFAULT_ORG.name,
        isActive: true,
      },
    });
  } catch (error) {
    if (isCompatError(error)) return null;
    throw error;
  }
}

async function loadUsers() {
  try {
    return await prisma.appUser.findMany({
      select: {
        id: true,
        role: true,
        organizationId: true,
        memberships: {
          where: { isActive: true },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: { organizationId: true, isDefault: true, isActive: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  } catch (error) {
    if (!isCompatError(error)) throw error;
    return prisma.appUser.findMany({
      select: {
        id: true,
        role: true,
        organizationId: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }
}

async function backfillUser(user, fallbackOrgId) {
  const memberships = Array.isArray(user.memberships) ? user.memberships : [];
  const defaultMembership = memberships.find((m) => m.isDefault) || memberships[0] || null;
  const targetOrgId = String(defaultMembership?.organizationId || user.organizationId || fallbackOrgId || "").trim() || null;
  if (!targetOrgId) return { touched: false, reason: "no-org-target" };

  const hasOrgId = !!String(user.organizationId || "").trim();
  const hasMembership = memberships.some((m) => String(m.organizationId || "").trim() === targetOrgId);
  const hasDefaultMembership = memberships.some((m) => !!m.isDefault);
  const role = membershipRoleFromAppRole(user.role);

  if (hasOrgId && (memberships.length === 0 || (hasMembership && hasDefaultMembership))) {
    return { touched: false, reason: "already-linked" };
  }

  let touched = false;
  await prisma.$transaction(async (tx) => {
    if (!hasOrgId) {
      try {
        await tx.appUser.update({
          where: { id: user.id },
          data: { organizationId: targetOrgId },
        });
        touched = true;
      } catch (error) {
        if (!isCompatError(error)) throw error;
      }
    }

    try {
      if (!hasMembership) {
        await tx.organizationMembership.create({
          data: {
            userId: user.id,
            organizationId: targetOrgId,
            role,
            isActive: true,
            isDefault: !hasDefaultMembership,
          },
        });
        touched = true;
      } else {
        await tx.organizationMembership.updateMany({
          where: { userId: user.id, organizationId: targetOrgId },
          data: {
            role,
            isActive: true,
            ...(hasDefaultMembership ? {} : { isDefault: true }),
          },
        });
        if (!hasDefaultMembership) touched = true;
      }

      if (!hasDefaultMembership) {
        await tx.organizationMembership.updateMany({
          where: { userId: user.id, NOT: { organizationId: targetOrgId } },
          data: { isDefault: false },
        });
      }
    } catch (error) {
      if (!isCompatError(error)) throw error;
    }
  });

  return { touched, reason: touched ? "linked" : "noop", targetOrgId };
}

async function run() {
  const summary = {
    totalUsers: 0,
    touchedUsers: 0,
    skippedUsers: 0,
    defaultOrgId: null,
    details: [],
  };

  try {
    const defaultOrg = await ensureDefaultOrg();
    summary.defaultOrgId = defaultOrg ? defaultOrg.id : null;
    const users = await loadUsers();
    summary.totalUsers = users.length;

    for (const user of users) {
      const result = await backfillUser(user, summary.defaultOrgId);
      summary.details.push({
        userId: user.id,
        reason: result.reason,
        targetOrgId: result.targetOrgId || null,
      });
      if (result.touched) summary.touchedUsers += 1;
      else summary.skippedUsers += 1;
    }

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(String((error && error.stack) || (error && error.message) || error || ""));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();

