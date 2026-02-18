import { getOrCreateAppConfig } from "@/lib/admin/appConfig";

export const SETTINGS_WRITE_ROLES = new Set(["ADMIN", "OWNER", "SUPERADMIN"]);

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
