import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendOpsEvent } from "@/lib/ops/eventLog";
import {
  fallbackWebhookEventId,
  parseResendLifecycleEvent,
  verifyResendSvixSignature,
} from "@/lib/email/resendWebhook";

export const runtime = "nodejs";

function isTruthy(value: unknown) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function isEmailProviderSchemaCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const message = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") return true;
  return (
    message.includes("emailproviderevent") &&
    ((message.includes("table") && message.includes("does not exist")) ||
      (message.includes("column") && message.includes("does not exist")) ||
      message.includes("unknown argument"))
  );
}

export async function POST(req: Request) {
  const rawBody = await req.text().catch(() => "");
  const svixId = toSafeString(req.headers.get("svix-id"));
  const svixTimestamp = toSafeString(req.headers.get("svix-timestamp"));
  const svixSignature = toSafeString(req.headers.get("svix-signature"));

  const secret = toSafeString(process.env.RESEND_WEBHOOK_SECRET);
  const allowUnsigned = isTruthy(process.env.RESEND_WEBHOOK_ALLOW_UNSIGNED);

  if (!secret && !allowUnsigned) {
    return NextResponse.json(
      {
        error: "Resend webhook is not configured.",
        code: "RESEND_WEBHOOK_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  let signatureVerified = false;
  if (secret) {
    signatureVerified = verifyResendSvixSignature({
      body: rawBody,
      secret,
      headers: {
        svixId,
        svixTimestamp,
        svixSignature,
      },
    });
    if (!signatureVerified) {
      appendOpsEvent({
        type: "EMAIL_PROVIDER_WEBHOOK_REJECTED",
        actor: "resend",
        route: "/api/webhooks/resend",
        status: 401,
        details: {
          reason: "invalid_signature",
        },
      });
      return NextResponse.json(
        { error: "Invalid webhook signature.", code: "WEBHOOK_SIGNATURE_INVALID" },
        { status: 401 },
      );
    }
  }

  const parsed = parseResendLifecycleEvent(rawBody);
  if (!parsed) {
    appendOpsEvent({
      type: "EMAIL_PROVIDER_WEBHOOK_REJECTED",
      actor: "resend",
      route: "/api/webhooks/resend",
      status: 400,
      details: {
        reason: "invalid_payload",
      },
    });
    return NextResponse.json(
      { error: "Invalid webhook payload.", code: "WEBHOOK_PAYLOAD_INVALID" },
      { status: 400 },
    );
  }

  const providerEventId = svixId || fallbackWebhookEventId(rawBody);

  try {
    await prisma.emailProviderEvent.upsert({
      where: {
        provider_providerEventId: {
          provider: "resend",
          providerEventId,
        },
      },
      update: {
        eventType: parsed.eventType,
        messageId: parsed.messageId,
        recipient: parsed.recipient,
        recipientDomain: parsed.recipientDomain,
        happenedAt: parsed.happenedAt,
        payload: parsed.payload as any,
      },
      create: {
        provider: "resend",
        providerEventId,
        eventType: parsed.eventType,
        messageId: parsed.messageId,
        recipient: parsed.recipient,
        recipientDomain: parsed.recipientDomain,
        happenedAt: parsed.happenedAt,
        payload: parsed.payload as any,
      },
      select: { id: true },
    });

    appendOpsEvent({
      type: "EMAIL_PROVIDER_WEBHOOK_INGESTED",
      actor: "resend",
      route: "/api/webhooks/resend",
      status: 200,
      details: {
        providerEventId,
        eventType: parsed.eventType,
        messageId: parsed.messageId,
        signatureVerified,
      },
    });

    return NextResponse.json({
      ok: true,
      provider: "resend",
      providerEventId,
      eventType: parsed.eventType,
      messageId: parsed.messageId,
      verified: signatureVerified,
    });
  } catch (error: unknown) {
    if (isEmailProviderSchemaCompatError(error)) {
      return NextResponse.json(
        {
          error: "Email provider event storage is not available yet in this environment. Run database migrations.",
          code: "EMAIL_PROVIDER_EVENT_SCHEMA_MISSING",
        },
        { status: 503 },
      );
    }
    appendOpsEvent({
      type: "EMAIL_PROVIDER_WEBHOOK_ERROR",
      actor: "resend",
      route: "/api/webhooks/resend",
      status: 500,
      details: {
        error: String((error as { message?: string })?.message || "EMAIL_PROVIDER_WEBHOOK_ERROR"),
      },
    });
    return NextResponse.json(
      { error: "Webhook ingestion failed.", code: "WEBHOOK_INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

