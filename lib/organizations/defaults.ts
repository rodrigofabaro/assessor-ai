import { prisma } from "@/lib/prisma";

export const DEFAULT_ORG_ID = "org_default";
export const DEFAULT_ORG_SLUG = "default";
export const DEFAULT_ORG_NAME = "Default Organization";

export function normalizeOrgSlug(input: unknown) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function ensureDefaultOrganization() {
  return prisma.organization.upsert({
    where: { slug: DEFAULT_ORG_SLUG },
    update: {},
    create: {
      id: DEFAULT_ORG_ID,
      slug: DEFAULT_ORG_SLUG,
      name: DEFAULT_ORG_NAME,
      isActive: true,
    },
  });
}

export async function resolveOrganizationId(input: unknown) {
  const id = String(input || "").trim();
  if (id) {
    const found = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (found?.isActive) return found.id;
  }
  const fallback = await ensureDefaultOrganization();
  return fallback.id;
}
