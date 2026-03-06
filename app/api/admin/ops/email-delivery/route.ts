import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestSession } from "@/lib/auth/requestSession";
import { classifyResendLifecycle } from "@/lib/email/resendWebhook";

function canViewEmailDelivery(session: Awaited<ReturnType<typeof getRequestSession>>) {
  if (!session?.userId) return false;
  if (session.userId.startsWith("env:")) return true;
  return !!session.isSuperAdmin;
}

function isOutboundEmailSchemaCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const message = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") return true;
  if (message.includes("emailproviderevent")) return true;
  return (
    message.includes("outboundemailevent") &&
    ((message.includes("table") && message.includes("does not exist")) ||
      (message.includes("column") && message.includes("does not exist")) ||
      message.includes("unknown argument"))
  );
}

type ChannelRollup = {
  channel: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
};

type LifecycleSummary = {
  total24h: number;
  delivered24h: number;
  bounced24h: number;
  opened24h: number;
  clicked24h: number;
  complained24h: number;
};

export async function GET(req: Request) {
  const session = await getRequestSession();
  if (!canViewEmailDelivery(session)) {
    return NextResponse.json({ error: "Only SUPER_ADMIN can view email delivery telemetry." }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.max(10, Math.min(200, Number(url.searchParams.get("limit") || 80)));
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const [recent, grouped, providerGrouped, providerRecent] = await Promise.all([
      prisma.outboundEmailEvent.findMany({
        orderBy: { ts: "desc" },
        take: limit,
        select: {
          id: true,
          ts: true,
          channel: true,
          provider: true,
          attempted: true,
          sent: true,
          recipientDomain: true,
          subject: true,
          providerMessageId: true,
          error: true,
        },
      }),
      prisma.outboundEmailEvent.groupBy({
        by: ["channel", "attempted", "sent"],
        where: { ts: { gte: since24h } },
        _count: { _all: true },
      }),
      prisma.emailProviderEvent.groupBy({
        by: ["eventType"],
        where: {
          provider: "resend",
          createdAt: { gte: since24h },
        },
        _count: { _all: true },
      }),
      prisma.emailProviderEvent.findMany({
        where: { provider: "resend" },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          createdAt: true,
          eventType: true,
          messageId: true,
          recipientDomain: true,
        },
      }),
    ]);

    const byChannelMap = new Map<string, ChannelRollup>();
    let total24h = 0;
    let sent24h = 0;
    let failed24h = 0;
    let skipped24h = 0;
    const lifecycle: LifecycleSummary = {
      total24h: 0,
      delivered24h: 0,
      bounced24h: 0,
      opened24h: 0,
      clicked24h: 0,
      complained24h: 0,
    };

    for (const row of grouped) {
      const channel = String(row.channel || "").trim().toLowerCase() || "unknown";
      const count = Number(row._count?._all || 0);
      total24h += count;
      if (!byChannelMap.has(channel)) {
        byChannelMap.set(channel, { channel, total: 0, sent: 0, failed: 0, skipped: 0 });
      }
      const bucket = byChannelMap.get(channel)!;
      bucket.total += count;

      if (row.sent) {
        sent24h += count;
        bucket.sent += count;
      } else if (row.attempted) {
        failed24h += count;
        bucket.failed += count;
      } else {
        skipped24h += count;
        bucket.skipped += count;
      }
    }

    for (const row of providerGrouped) {
      const count = Number(row._count?._all || 0);
      lifecycle.total24h += count;
      const kind = classifyResendLifecycle(String(row.eventType || ""));
      if (kind === "delivered") lifecycle.delivered24h += count;
      else if (kind === "bounced") lifecycle.bounced24h += count;
      else if (kind === "opened") lifecycle.opened24h += count;
      else if (kind === "clicked") lifecycle.clicked24h += count;
      else if (kind === "complained") lifecycle.complained24h += count;
    }

    return NextResponse.json({
      ok: true,
      summary: {
        total24h,
        sent24h,
        failed24h,
        skipped24h,
      },
      lifecycle,
      channels: Array.from(byChannelMap.values()).sort((a, b) => b.total - a.total),
      events: recent.map((row) => ({
        id: row.id,
        ts: row.ts.toISOString(),
        channel: row.channel,
        provider: row.provider,
        attempted: row.attempted,
        sent: row.sent,
        recipientDomain: row.recipientDomain,
        subject: row.subject,
        providerMessageId: row.providerMessageId,
        error: row.error,
      })),
      providerEvents: providerRecent.map((row) => ({
        id: row.id,
        ts: row.createdAt.toISOString(),
        eventType: row.eventType,
        lifecycle: classifyResendLifecycle(row.eventType),
        messageId: row.messageId,
        recipientDomain: row.recipientDomain,
      })),
    });
  } catch (error) {
    if (isOutboundEmailSchemaCompatError(error)) {
      return NextResponse.json({
        ok: true,
        summary: { total24h: 0, sent24h: 0, failed24h: 0, skipped24h: 0 },
        lifecycle: {
          total24h: 0,
          delivered24h: 0,
          bounced24h: 0,
          opened24h: 0,
          clicked24h: 0,
          complained24h: 0,
        },
        channels: [],
        events: [],
        providerEvents: [],
        warning:
          "Email telemetry tables are not available yet in this environment. Run database migrations.",
        code: "OUTBOUND_EMAIL_SCHEMA_MISSING",
      });
    }
    return NextResponse.json({ error: "Failed to load email delivery telemetry." }, { status: 500 });
  }
}
