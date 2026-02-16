import { prisma } from "@/lib/prisma";

export async function getOrCreateAppConfig() {
  const existing = await prisma.appConfig.findUnique({
    where: { id: 1 },
    include: { activeAuditUser: true },
  });
  if (existing) return existing;
  return prisma.appConfig.create({
    data: { id: 1 },
    include: { activeAuditUser: true },
  });
}

export async function getCurrentAuditActor(preferred?: string | null) {
  const direct = String(preferred || "").trim();
  if (direct) return direct;

  const cfg = await getOrCreateAppConfig();
  const active = cfg.activeAuditUser;
  if (active?.isActive) return active.fullName;
  return "system";
}

