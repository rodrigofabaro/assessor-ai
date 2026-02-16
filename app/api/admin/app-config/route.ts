import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateAppConfig } from "@/lib/admin/appConfig";

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

  const updated = await prisma.appConfig.upsert({
    where: { id: 1 },
    create: { id: 1, activeAuditUserId: activeAuditUserId || null },
    update: { activeAuditUserId: activeAuditUserId || null },
    include: { activeAuditUser: true },
  });

  return NextResponse.json({ ok: true, config: updated });
}

