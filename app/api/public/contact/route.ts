import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendOpsEvent } from "@/lib/ops/eventLog";
import { canSendInviteEmail, sendContactLeadEmail } from "@/lib/auth/inviteEmail";

export const runtime = "nodejs";

const MAX_PER_IP_PER_HOUR = 5;

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

    if (!canSendInviteEmail()) {
      return NextResponse.json(
        { error: "Contact email delivery is not configured.", code: "CONTACT_EMAIL_NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const sendResult = await sendContactLeadEmail({
      name: payload.name,
      email: payload.email,
      organization: payload.organization,
      message: payload.message,
      requestIp: ip,
      requestUserAgent: userAgent,
    });

    if (!sendResult.sent) {
      appendOpsEvent({
        type: "CONTACT_FORM_SEND_FAILED",
        actor: ip || "anon",
        route: "/api/public/contact",
        status: 502,
        details: {
          provider: sendResult.provider,
          error: sendResult.error || null,
        },
      });
      return NextResponse.json(
        { error: "Unable to send your message right now.", code: "CONTACT_SEND_FAILED" },
        { status: 502 }
      );
    }

    appendOpsEvent({
      type: "CONTACT_FORM_SUBMIT",
      actor: ip || "anon",
      route: "/api/public/contact",
      status: 200,
      details: {
        provider: sendResult.provider,
        id: sendResult.id || null,
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
