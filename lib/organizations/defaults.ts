import { prisma } from "@/lib/prisma";

export const DEFAULT_ORG_ID = "org_default";
export const DEFAULT_ORG_SLUG = "default";
export const DEFAULT_ORG_NAME = "Default Organization";
export const SUPER_ADMIN_DEFAULT_ORG_ID = "org_assessor_ai";
export const SUPER_ADMIN_DEFAULT_ORG_SLUG = "assessor-ai";
export const SUPER_ADMIN_DEFAULT_ORG_NAME = "Assessor AI";

let organizationTableAvailable: boolean | null = null;

function isOrgSchemaCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const message = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") return true;
  return (
    message.includes("organization") &&
    ((message.includes("table") && message.includes("does not exist")) ||
      (message.includes("column") && message.includes("does not exist")) ||
      message.includes("unknown argument"))
  );
}

function fallbackOrganization() {
  return {
    id: DEFAULT_ORG_ID,
    slug: DEFAULT_ORG_SLUG,
    name: DEFAULT_ORG_NAME,
    isActive: true,
  };
}

function fallbackSuperAdminOrganization() {
  return {
    id: SUPER_ADMIN_DEFAULT_ORG_ID,
    slug: SUPER_ADMIN_DEFAULT_ORG_SLUG,
    name: SUPER_ADMIN_DEFAULT_ORG_NAME,
    isActive: true,
  };
}

export function normalizeOrgSlug(input: unknown) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function ensureDefaultOrganization() {
  if (organizationTableAvailable === false) return fallbackOrganization();
  try {
    const org = await prisma.organization.upsert({
      where: { slug: DEFAULT_ORG_SLUG },
      update: {},
      create: {
        id: DEFAULT_ORG_ID,
        slug: DEFAULT_ORG_SLUG,
        name: DEFAULT_ORG_NAME,
        isActive: true,
      },
    });
    organizationTableAvailable = true;
    return org;
  } catch (error) {
    if (!isOrgSchemaCompatError(error)) throw error;
    organizationTableAvailable = false;
    return fallbackOrganization();
  }
}

export async function ensureSuperAdminOrganization() {
  if (organizationTableAvailable === false) return fallbackSuperAdminOrganization();
  try {
    const org = await prisma.organization.upsert({
      where: { slug: SUPER_ADMIN_DEFAULT_ORG_SLUG },
      update: {
        name: SUPER_ADMIN_DEFAULT_ORG_NAME,
        isActive: true,
      },
      create: {
        id: SUPER_ADMIN_DEFAULT_ORG_ID,
        slug: SUPER_ADMIN_DEFAULT_ORG_SLUG,
        name: SUPER_ADMIN_DEFAULT_ORG_NAME,
        isActive: true,
      },
    });
    organizationTableAvailable = true;
    return org;
  } catch (error) {
    if (!isOrgSchemaCompatError(error)) throw error;
    organizationTableAvailable = false;
    return fallbackSuperAdminOrganization();
  }
}

export async function resolveOrganizationId(input: unknown) {
  const id = String(input || "").trim();
  if (organizationTableAvailable === false) {
    return id || DEFAULT_ORG_ID;
  }
  if (id) {
    try {
      const found = await prisma.organization.findUnique({
        where: { id },
        select: { id: true, isActive: true },
      });
      organizationTableAvailable = true;
      if (found?.isActive) return found.id;
    } catch (error) {
      if (!isOrgSchemaCompatError(error)) throw error;
      organizationTableAvailable = false;
      return id || DEFAULT_ORG_ID;
    }
  }
  const fallback = await ensureDefaultOrganization();
  return fallback.id;
}
