import { cookies } from "next/headers";
import { getSessionCookieName, verifySignedSessionToken } from "@/lib/auth/session";
import { ensureSuperAdminOrganization } from "@/lib/organizations/defaults";
import { ensureUserOrganizationScope } from "@/lib/organizations/userScope";
import { prisma } from "@/lib/prisma";

let orgScopeAvailableCache: boolean | null = null;

function envFlagEnabled(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function isOrgScopeCompatError(error: unknown) {
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

export async function isOrganizationScopeAvailable() {
  if (orgScopeAvailableCache !== null) return orgScopeAvailableCache;
  try {
    await prisma.appUser.findFirst({
      select: { id: true, organizationId: true },
    });
    orgScopeAvailableCache = true;
    return true;
  } catch (error) {
    if (!isOrgScopeCompatError(error)) throw error;
    orgScopeAvailableCache = false;
    return false;
  }
}

export async function getRequestSession() {
  const store = await cookies();
  const token = String(store.get(getSessionCookieName())?.value || "");
  const session = verifySignedSessionToken(token);
  if (!session?.userId) return session;
  const orgScopeAvailable = await isOrganizationScopeAvailable().catch(() => true);
  if (!orgScopeAvailable) {
    return { ...session, orgId: null };
  }
  if (String(session.orgId || "").trim()) return session;
  if (String(session.userId || "").startsWith("env:")) return session;

  try {
    let preferredOrgId: string | null = null;
    if (session.isSuperAdmin) {
      const superAdminOrg = await ensureSuperAdminOrganization().catch(() => null);
      preferredOrgId = String(superAdminOrg?.id || "").trim() || null;
    }
    const ensured = await ensureUserOrganizationScope({
      userId: session.userId,
      appRole: session.role,
      preferredOrgId,
    });
    if (String(ensured.orgId || "").trim()) {
      return {
        ...session,
        orgId: String(ensured.orgId || "").trim() || null,
      };
    }
  } catch {
    // keep original session shape if org backfill cannot run in this request path
  }

  return session;
}

export async function getRequestOrganizationId() {
  const orgScopeAvailable = await isOrganizationScopeAvailable().catch(() => true);
  if (!orgScopeAvailable) return null;
  const session = await getRequestSession();
  return String(session?.orgId || "").trim() || null;
}

export async function isRequestSuperAdmin() {
  const session = await getRequestSession();
  return !!session?.isSuperAdmin;
}

export function isOrganizationScopeStrictReadsEnabled() {
  return envFlagEnabled(process.env.AUTH_ORG_SCOPE_STRICT_READS || process.env.ORG_SCOPE_STRICT_READS);
}

export function addOrganizationReadScope<T extends Record<string, unknown>>(where: T, organizationId: string | null) {
  if (!organizationId) return where;
  const strictReads = isOrganizationScopeStrictReadsEnabled();
  const visibilityScope = strictReads ? [{ organizationId }] : [{ organizationId }, { organizationId: null }];
  return {
    AND: [
      { OR: visibilityScope },
      where,
    ],
  } as Record<string, unknown>;
}
