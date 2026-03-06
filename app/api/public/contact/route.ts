import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendOpsEvent } from "@/lib/ops/eventLog";
import { canSendInviteEmail, sendContactLeadEmail } from "@/lib/auth/inviteEmail";

export const runtime = "nodejs";

const MAX_PER_IP_PER_HOUR = 5;
const CONTACT_SOURCE = "landing-page";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function clamp(value: string, maxLen: number) {
  return value.slice(0, maxLen);
}

function pickClientIp(req: Request) {
  const forwardedFor = toSafeString(req.headers.get("x-forwarded-for"));
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0];
    if (first) return first.trim();
  }
  return toSafeString(req.headers.get("x-real-ip")) || null;
}

function pickClientUserAgent(req: Request) {
  return toSafeString(req.headers.get("user-agent")) || null;
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

async function updateLeadDeliveryStatus(
  leadId: string,
  input: {
    provider?: string | null;
    messageId?: string | null;
    deliveredAt?: Date | null;
    error?: string | null;
  }
) {
  const id = toSafeString(leadId);
  if (!id) return;
  try {
    await prisma.contactLead.update({
      where: { id },
      data: {
        emailDeliveryProvider: toSafeString(input.provider) || null,
        emailDeliveryId: toSafeString(input.messageId) || null,
        emailDeliveredAt: input.deliveredAt || null,
        emailDeliveryError: toSafeString(input.error) || null,
      },
      select: { id: true },
    });
  } catch {
    // Do not fail the request when delivery metadata update fails.
  }
}

async function parsePayload(req: Request) {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      name: clamp(toSafeString(body.name), 120),
      email: clamp(toSafeString(body.email).toLowerCase(), 200),
      organization: clamp(toSafeString(body.organization), 200),
      message: clamp(toSafeString(body.message), 5000),
      website: clamp(toSafeString(body.website), 250), // honeypot
    };
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    return {
      name: clamp(toSafeString(form?.get("name")), 120),
      email: clamp(toSafeString(form?.get("email")).toLowerCase(), 200),
      organization: clamp(toSafeString(form?.get("organization")), 200),
      message: clamp(toSafeString(form?.get("message")), 5000),
      website: clamp(toSafeString(form?.get("website")), 250), // honeypot
    };
  }
  return { name: "", email: "", organization: "", message: "", website: "" };
}

async function isIpRateLimited(ip: string | null) {
  const key = toSafeString(ip);
  if (!key) return false;
  const model = (prisma as any)?.opsRuntimeEvent;
  if (!model || typeof model.count !== "function") return false;
  try {
    const count = await model.count({
      where: {
        type: "CONTACT_FORM_SUBMIT",
        actor: key,
        ts: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    return Number(count || 0) >= MAX_PER_IP_PER_HOUR;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const ip = pickClientIp(req);
  const userAgent = pickClientUserAgent(req);

  try {
    const payload = await parsePayload(req);

    // Bot trap: pretend success and do nothing.
    if (payload.website) {
      return NextResponse.json({ ok: true, message: "Thanks. We will be in touch shortly." });
    }

    if (!payload.name || !payload.email || !payload.message) {
      return NextResponse.json(
        { error: "Name, email, and message are required.", code: "CONTACT_REQUIRED_FIELDS" },
        { status: 400 }
      );
    }

    if (await isIpRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later.", code: "CONTACT_RATE_LIMITED" },
        { status: 429 }
      );
    }

    let leadId = "";
    try {
      const lead = await prisma.contactLead.create({
        data: {
          source: CONTACT_SOURCE,
          name: payload.name,
          email: payload.email,
          organization: payload.organization || null,
          message: payload.message,
          ipAddress: ip,
          userAgent: userAgent,
        },
        select: { id: true },
      });
      leadId = toSafeString(lead.id);
    } catch (error) {
      if (isContactLeadSchemaCompatError(error)) {
        return NextResponse.json(
          {
            error: "Contact lead storage is not available yet in this environment. Run database migrations.",
            code: "CONTACT_SCHEMA_MISSING",
          },
          { status: 503 }
        );
      }
      appendOpsEvent({
        type: "CONTACT_FORM_PERSIST_FAILED",
        actor: ip || "anon",
        route: "/api/public/contact",
        status: 503,
        details: {
          error: String((error as { message?: string })?.message || "CONTACT_FORM_PERSIST_FAILED"),
        },
      });
      return NextResponse.json(
        { error: "Unable to record your request right now. Please try again shortly.", code: "CONTACT_PERSIST_FAILED" },
        { status: 503 }
      );
    }

    let emailAttempted = false;
    let emailNotified = false;
    let deliveryProvider: string | null = null;
    let deliveryError: string | null = null;

    if (canSendInviteEmail()) {
      emailAttempted = true;
      const sendResult = await sendContactLeadEmail({
        name: payload.name,
        email: payload.email,
        organization: payload.organization,
        message: payload.message,
        requestIp: ip,
        requestUserAgent: userAgent,
      });
      deliveryProvider = toSafeString(sendResult.provider) || null;

      if (!sendResult.sent) {
        deliveryError = toSafeString(sendResult.error) || "CONTACT_SEND_FAILED";
        await updateLeadDeliveryStatus(leadId, {
          provider: deliveryProvider,
          error: deliveryError,
          deliveredAt: null,
          messageId: null,
        });
        appendOpsEvent({
          type: "CONTACT_FORM_SEND_FAILED",
          actor: ip || "anon",
          route: "/api/public/contact",
          status: 502,
          details: {
            leadId,
            provider: deliveryProvider,
            error: deliveryError,
          },
        });
      } else {
        emailNotified = true;
        await updateLeadDeliveryStatus(leadId, {
          provider: deliveryProvider,
          messageId: toSafeString(sendResult.id) || null,
          deliveredAt: new Date(),
          error: null,
        });
      }
    } else {
      deliveryError = "CONTACT_EMAIL_NOT_CONFIGURED";
      await updateLeadDeliveryStatus(leadId, {
        provider: null,
        messageId: null,
        deliveredAt: null,
        error: deliveryError,
      });
      appendOpsEvent({
        type: "CONTACT_FORM_EMAIL_SKIPPED",
        actor: ip || "anon",
        route: "/api/public/contact",
        status: 202,
        details: {
          leadId,
          reason: deliveryError,
        },
      });
    }

    appendOpsEvent({
      type: "CONTACT_FORM_SUBMIT",
      actor: ip || "anon",
      route: "/api/public/contact",
      status: 200,
      details: {
        leadId: leadId || null,
        emailAttempted,
        emailNotified,
        provider: deliveryProvider,
        deliveryError,
        emailDomain: payload.email.includes("@") ? payload.email.split("@")[1] : null,
        hasOrganization: !!payload.organization,
        messageLength: payload.message.length,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Thanks. We will be in touch shortly.",
    });
  } catch (error: unknown) {
    appendOpsEvent({
      type: "CONTACT_FORM_ERROR",
      actor: ip || "anon",
      route: "/api/public/contact",
      status: 500,
      details: {
        error: String((error as { message?: string })?.message || "CONTACT_FORM_ERROR"),
      },
    });
    return NextResponse.json(
      { error: "Contact request failed.", code: "CONTACT_INTERNAL" },
      { status: 500 }
    );
  }
}
