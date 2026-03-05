import { getOrCreateAppConfig } from "@/lib/admin/appConfig";
import { getRequestSession } from "@/lib/auth/requestSession";

export const SETTINGS_WRITE_ROLES = new Set(["ADMIN", "OWNER", "SUPERADMIN"]);
export const SETTINGS_READ_ROLES = new Set([
  "ADMIN",
  "OWNER",
  "SUPERADMIN",
  "TUTOR",
  "IV",
  "QA",
  "SUPPORT",
]);

export async function getSettingsReadContext() {
  const cfg = await getOrCreateAppConfig();
  const session = await getRequestSession().catch(() => null);
  const sessionRole = String(session?.role || "").trim().toUpperCase();
  const sessionCanRead = !!session && (session?.isSuperAdmin || sessionRole === "ADMIN" || sessionRole === "ASSESSOR" || sessionRole === "IV");
  if (sessionCanRead) {
    return {
      user: cfg.activeAuditUser || null,
      role: session?.isSuperAdmin ? "SUPER_ADMIN" : sessionRole,
      canRead: true,
      source: "session" as const,
    };
  }

  const user = cfg.activeAuditUser || null;
  const role = String(user?.role || "").trim().toUpperCase();
  // Bootstrap mode: if no active audit user is set yet, allow read-only settings access.
  const canRead = !user || (!!user.isActive && (SETTINGS_READ_ROLES.has(role) || SETTINGS_WRITE_ROLES.has(role)));
  return {
    user,
    role: role || "SYSTEM",
    canRead,
    source: user ? "audit-user" : "bootstrap",
  };
}

export async function getSettingsWriteContext() {
  const cfg = await getOrCreateAppConfig();
  const user = cfg.activeAuditUser || null;
  const session = await getRequestSession().catch(() => null);
  const sessionRole = String(session?.role || "").trim().toUpperCase();
  const canWrite = !!session && (session?.isSuperAdmin || sessionRole === "ADMIN");
  return {
    user,
    role: session?.isSuperAdmin ? "SUPER_ADMIN" : sessionRole || "SYSTEM",
    canWrite,
    source: session ? "session" : "none",
  };
}
