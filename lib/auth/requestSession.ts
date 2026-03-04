import { cookies } from "next/headers";
import { getSessionCookieName, verifySignedSessionToken } from "@/lib/auth/session";

export async function getRequestSession() {
  const store = await cookies();
  const token = String(store.get(getSessionCookieName())?.value || "");
  return verifySignedSessionToken(token);
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
