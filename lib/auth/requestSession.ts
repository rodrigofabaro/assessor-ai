import { cookies } from "next/headers";
import { getSessionCookieName, verifySignedSessionToken } from "@/lib/auth/session";
import { ensureUserOrganizationScope } from "@/lib/organizations/userScope";

export async function getRequestSession() {
  const store = await cookies();
  const token = String(store.get(getSessionCookieName())?.value || "");
  const session = verifySignedSessionToken(token);
  if (!session?.userId) return session;
  if (String(session.orgId || "").trim()) return session;
  if (String(session.userId || "").startsWith("env:")) return session;

  try {
    const ensured = await ensureUserOrganizationScope({
      userId: session.userId,
      appRole: session.role,
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
  const session = await getRequestSession();
  return String(session?.orgId || "").trim() || null;
}

export async function isRequestSuperAdmin() {
  const session = await getRequestSession();
  return !!session?.isSuperAdmin;
}

export function addOrganizationReadScope<T extends Record<string, unknown>>(where: T, organizationId: string | null) {
  if (!organizationId) return where;
  return {
    AND: [
      { OR: [{ organizationId }, { organizationId: null }] },
      where,
    ],
  } as Record<string, unknown>;
}
