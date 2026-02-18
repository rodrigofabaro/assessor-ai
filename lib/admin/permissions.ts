import { prisma } from "@/lib/prisma";

export async function isAdminMutationAllowed() {
  const enforce = ["1", "true", "yes", "on"].includes(
    String(process.env.ENFORCE_ADMIN_MUTATIONS || "false").toLowerCase()
  );
  if (!enforce) return { ok: true, reason: null as string | null };

  const cfg = await prisma.appConfig.findUnique({
    where: { id: 1 },
    include: { activeAuditUser: true },
  });
  const u = cfg?.activeAuditUser;
  if (!u || !u.isActive) return { ok: false, reason: "No active audit user is configured." };
  if (String(u.role || "").toUpperCase() !== "ADMIN") {
    return { ok: false, reason: "Active audit user is not an ADMIN." };
  }
  return { ok: true, reason: null as string | null };
}

