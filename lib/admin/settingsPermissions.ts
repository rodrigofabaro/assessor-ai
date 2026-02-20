import { getOrCreateAppConfig } from "@/lib/admin/appConfig";

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
  const user = cfg.activeAuditUser || null;
  const role = String(user?.role || "").trim().toUpperCase();
  // Bootstrap mode: if no active audit user is set yet, allow read-only settings access.
  const canRead = !user || (!!user.isActive && (SETTINGS_READ_ROLES.has(role) || SETTINGS_WRITE_ROLES.has(role)));
  return {
    user,
    role: role || "SYSTEM",
    canRead,
  };
}

export async function getSettingsWriteContext() {
  const cfg = await getOrCreateAppConfig();
  const user = cfg.activeAuditUser || null;
  const role = String(user?.role || "").trim().toUpperCase();
  const canWrite = !!(user?.isActive && SETTINGS_WRITE_ROLES.has(role));
  return {
    user,
    role: role || "SYSTEM",
    canWrite,
  };
}
