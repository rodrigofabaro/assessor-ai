import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestSession } from "@/lib/auth/requestSession";

function canViewContactLeads(session: Awaited<ReturnType<typeof getRequestSession>>) {
  if (!session?.userId) return false;
  if (session.userId.startsWith("env:")) return true;
  return !!session.isSuperAdmin;
}

function isContactLeadSchemaCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const message = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") return true;
  return (
    message.includes("contactlead") &&
    ((message.includes("table") && message.includes("does not exist")) ||
      (message.includes("column") && message.includes("does not exist")) ||
      message.includes("unknown argument"))
  );
}

export async function GET(req: Request) {
  const session = await getRequestSession();
  if (!canViewContactLeads(session)) {
    return NextResponse.json({ error: "Only SUPER_ADMIN can view contact leads." }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.max(10, Math.min(200, Number(url.searchParams.get("limit") || 40)));
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const [leads, totalAll, total24h, delivered24h, failed24h] = await Promise.all([
      prisma.contactLead.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          source: true,
          name: true,
          email: true,
          organization: true,
          message: true,
          ipAddress: true,
          createdAt: true,
          emailDeliveredAt: true,
          emailDeliveryProvider: true,
          emailDeliveryError: true,
        },
      }),
      prisma.contactLead.count(),
      prisma.contactLead.count({ where: { createdAt: { gte: since24h } } }),
      prisma.contactLead.count({
        where: { createdAt: { gte: since24h }, emailDeliveredAt: { not: null } },
      }),
      prisma.contactLead.count({
        where: { createdAt: { gte: since24h }, emailDeliveryError: { not: null } },
      }),
    ]);

    const pending24h = Math.max(0, total24h - delivered24h - failed24h);

    return NextResponse.json({
      ok: true,
      leads,
      summary: {
        totalAll,
        total24h,
        delivered24h,
        failed24h,
        pending24h,
      },
    });
  } catch (error) {
    if (isContactLeadSchemaCompatError(error)) {
      return NextResponse.json({
        ok: true,
        leads: [],
        summary: {
          totalAll: 0,
          total24h: 0,
          delivered24h: 0,
          failed24h: 0,
          pending24h: 0,
        },
        warning: "Contact lead table is not available yet in this environment. Run database migrations.",
        code: "CONTACT_SCHEMA_MISSING",
      });
    }
    return NextResponse.json({ error: "Failed to load contact leads." }, { status: 500 });
  }
}

