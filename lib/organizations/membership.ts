import type { AppRole } from "@/lib/auth/rbac";
import { parseRole } from "@/lib/auth/rbac";

export type OrganizationMembershipRole = "ORG_ADMIN" | "ASSESSOR" | "IV" | "VIEWER";
export type PlatformRole = "USER" | "SUPER_ADMIN";

export function normalizePlatformRole(value: unknown): PlatformRole {
  return String(value || "").trim().toUpperCase() === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER";
}

export function isSuperAdminPlatformRole(value: unknown) {
  return normalizePlatformRole(value) === "SUPER_ADMIN";
}

export function normalizeOrganizationMembershipRole(value: unknown): OrganizationMembershipRole {
  const role = String(value || "").trim().toUpperCase();
  if (role === "ORG_ADMIN") return "ORG_ADMIN";
  if (role === "IV") return "IV";
  if (role === "VIEWER") return "VIEWER";
  return "ASSESSOR";
}

export function mapMembershipRoleToAppRole(value: unknown): AppRole {
  const role = normalizeOrganizationMembershipRole(value);
  if (role === "ORG_ADMIN") return "ADMIN";
  if (role === "IV") return "IV";
  return "ASSESSOR";
}

export function resolveSessionRole(input: {
  platformRole?: unknown;
  membershipRole?: unknown;
  legacyRole?: unknown;
}): AppRole | null {
  if (isSuperAdminPlatformRole(input.platformRole)) return "ADMIN";
  if (input.membershipRole !== undefined && input.membershipRole !== null) {
    return mapMembershipRoleToAppRole(input.membershipRole);
  }
  return parseRole(String(input.legacyRole || ""));
}

export function pickDefaultMembership<T extends { isDefault?: boolean }>(items: T[]): T | null {
  if (!Array.isArray(items) || !items.length) return null;
  const defaultMembership = items.find((row) => !!row?.isDefault);
  return defaultMembership || items[0] || null;
}
