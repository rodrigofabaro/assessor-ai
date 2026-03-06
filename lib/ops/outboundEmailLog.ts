import { prisma } from "@/lib/prisma";

export type OutboundEmailLogInput = {
  channel: string;
  provider: string;
  attempted: boolean;
  sent: boolean;
  recipientEmail?: string | null;
  subject?: string | null;
  providerMessageId?: string | null;
  error?: string | null;
  details?: Record<string, unknown> | null;
};

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function pickRecipientDomain(email: string | null | undefined) {
  const value = toSafeString(email).toLowerCase();
  if (!value.includes("@")) return null;
  const domain = value.split("@")[1];
  return toSafeString(domain) || null;
}

function isOutboundEmailSchemaCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const message = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") return true;
  return (
    message.includes("outboundemailevent") &&
    ((message.includes("table") && message.includes("does not exist")) ||
      (message.includes("column") && message.includes("does not exist")) ||
      message.includes("unknown argument"))
  );
}

export async function appendOutboundEmailEvent(input: OutboundEmailLogInput) {
  const channel = toSafeString(input.channel).toLowerCase() || "unknown";
  const provider = toSafeString(input.provider).toLowerCase() || "unknown";
  try {
    await prisma.outboundEmailEvent.create({
      data: {
        channel,
        provider,
        attempted: !!input.attempted,
        sent: !!input.sent,
        recipientDomain: pickRecipientDomain(input.recipientEmail),
        subject: toSafeString(input.subject).slice(0, 250) || null,
        providerMessageId: toSafeString(input.providerMessageId).slice(0, 250) || null,
        error: toSafeString(input.error).slice(0, 500) || null,
        details: (input.details || null) as any,
      },
      select: { id: true },
    });
    return { ok: true as const };
  } catch (error) {
    if (isOutboundEmailSchemaCompatError(error)) {
      return { ok: false as const, reason: "OUTBOUND_EMAIL_SCHEMA_MISSING" };
    }
    return { ok: false as const, reason: "OUTBOUND_EMAIL_LOG_FAILED" };
  }
}
