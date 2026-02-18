import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateAppConfig } from "@/lib/admin/appConfig";
import { getSettingsWriteContext } from "@/lib/admin/settingsPermissions";
import { appendSettingsAuditEvent } from "@/lib/admin/settingsAudit";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";

export async function GET() {
  const cfg = await getOrCreateAppConfig();
  return NextResponse.json({
    id: cfg.id,
    activeAuditUserId: cfg.activeAuditUserId,
    faviconUpdatedAt: cfg.faviconUpdatedAt,
    activeAuditUser: cfg.activeAuditUser
      ? {
          id: cfg.activeAuditUser.id,
          fullName: cfg.activeAuditUser.fullName,
          email: cfg.activeAuditUser.email,
          role: cfg.activeAuditUser.role,
          isActive: cfg.activeAuditUser.isActive,
        }
      : null,
  });
}

export async function PUT(req: Request) {
  const ctx = await getSettingsWriteContext();
  if (!ctx.canWrite) {
    return NextResponse.json({ error: "Insufficient role for app settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const activeAuditUserId =
    body?.activeAuditUserId === null || body?.activeAuditUserId === ""
      ? null
      : String(body?.activeAuditUserId || "").trim();

  if (activeAuditUserId) {
    const user = await prisma.appUser.findUnique({ where: { id: activeAuditUserId } });
    if (!user) {
      return NextResponse.json({ error: "Active audit user not found." }, { status: 404 });
    }
  }

  const prev = await getOrCreateAppConfig();
  const updated = await prisma.appConfig.upsert({
    where: { id: 1 },
    create: { id: 1, activeAuditUserId: activeAuditUserId || null },
    update: { activeAuditUserId: activeAuditUserId || null },
    include: { activeAuditUser: true },
  });
  appendSettingsAuditEvent({
    actor: await getCurrentAuditActor(),
    role: ctx.role,
    action: "APP_CONFIG_UPDATED",
    target: "app-config",
    changes: {
      activeAuditUserIdFrom: prev.activeAuditUserId || null,
      activeAuditUserIdTo: updated.activeAuditUserId || null,
    },
  });

  return NextResponse.json({ ok: true, config: updated });
}
