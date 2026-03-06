import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { hashPasswordRecoveryToken } from "@/lib/auth/passwordRecoveryToken";
import {
  buildAuthRateActor,
  checkAuthRateLimit,
  recordAuthRateEvent,
} from "@/lib/security/authRateLimit";
import { maybeSendAuthAnomalyAlert } from "@/lib/security/authAnomalyAlert";

export const runtime = "nodejs";
const CONFIRM_REQUESTS_PER_IP_PER_HOUR = Number(process.env.AUTH_RATE_LIMIT_RECOVERY_CONFIRM_IP || 20);
const CONFIRM_RATE_WINDOW_MS = 60 * 60 * 1000;

function toSafeString(value: unknown) {
  return String(value || "").trim();
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
      rid: toSafeString(body.rid),
      token: toSafeString(body.token),
      newPassword: toSafeString(body.newPassword),
    };
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    return {
      rid: toSafeString(form?.get("rid")),
      token: toSafeString(form?.get("token")),
      newPassword: toSafeString(form?.get("newPassword")),
    };
  }
  return { rid: "", token: "", newPassword: "" };
}

function isAppUserSchemaCompatError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return (
    message.includes("mustresetpassword") ||
    message.includes("passwordupdatedat") ||
    message.includes("unknown argument") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function isPasswordRecoveryTokenSchemaCompatError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return (
    message.includes("passwordresettoken") ||
    message.includes("the table") ||
    message.includes("does not exist") ||
    message.includes("unknown argument") ||
    message.includes("invalid `prisma.passwordresettoken") ||
    message.includes("p2021")
  );
}

export async function POST(req: Request) {
  try {
    const { rid, token, newPassword } = await parsePayload(req);
    if (!rid || !token || !newPassword) {
      return NextResponse.json(
        {
          error: "Recovery link and new password are required.",
          code: "AUTH_PASSWORD_RECOVERY_CONFIRM_REQUIRED_FIELDS",
        },
        { status: 400 }
      );
    }

    const requestedIp = pickClientIp(req);
    const requestedUa = pickClientUserAgent(req);
    const ipActor = buildAuthRateActor("auth-recovery-confirm-ip", requestedIp);

    if (ipActor) {
      const gate = await checkAuthRateLimit({
        eventType: "AUTH_PASSWORD_RECOVERY_CONFIRM_ATTEMPT_IP",
        actor: ipActor,
        limit: CONFIRM_REQUESTS_PER_IP_PER_HOUR,
        windowMs: CONFIRM_RATE_WINDOW_MS,
      });
      if (gate.limited) {
        recordAuthRateEvent({
          eventType: "AUTH_PASSWORD_RECOVERY_CONFIRM_RATE_LIMITED_IP",
          actor: ipActor,
          windowMs: CONFIRM_RATE_WINDOW_MS,
          route: "/api/auth/password-recovery/confirm",
          status: 429,
          details: { count: gate.count, limit: CONFIRM_REQUESTS_PER_IP_PER_HOUR },
        });
        void maybeSendAuthAnomalyAlert({
          kind: "PASSWORD_RECOVERY_CONFIRM_RATE_LIMIT_IP",
          actor: ipActor,
          route: "/api/auth/password-recovery/confirm",
          details: { count: gate.count, limit: CONFIRM_REQUESTS_PER_IP_PER_HOUR },
        });
        const res = NextResponse.json(
          { error: "Too many recovery attempts. Request a new link and try later.", code: "AUTH_RATE_LIMITED" },
          { status: 429 }
        );
        res.headers.set("Retry-After", String(gate.retryAfterSeconds || 60));
        return res;
      }
      recordAuthRateEvent({
        eventType: "AUTH_PASSWORD_RECOVERY_CONFIRM_ATTEMPT_IP",
        actor: ipActor,
        windowMs: CONFIRM_RATE_WINDOW_MS,
        route: "/api/auth/password-recovery/confirm",
        status: 200,
      });
    }

    let tokenHash = "";
    try {
      tokenHash = hashPasswordRecoveryToken(token);
    } catch {
      return NextResponse.json(
        {
          error: "Password recovery token service is not configured.",
          code: "AUTH_PASSWORD_RECOVERY_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    let nextHash = "";
    try {
      nextHash = hashPassword(newPassword);
    } catch (error: unknown) {
      return NextResponse.json(
        {
          error: String((error as { message?: string })?.message || "Invalid password."),
          code: "AUTH_PASSWORD_RECOVERY_INVALID_PASSWORD",
        },
        { status: 400 }
      );
    }

    const now = new Date();
    try {
      const tokenRow = await prisma.passwordResetToken.findFirst({
        where: {
          id: rid,
          tokenHash,
          usedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true, userId: true },
      });

      if (!tokenRow?.id || !tokenRow.userId) {
        if (ipActor) {
          recordAuthRateEvent({
            eventType: "AUTH_PASSWORD_RECOVERY_CONFIRM_FAILED_IP",
            actor: ipActor,
            windowMs: CONFIRM_RATE_WINDOW_MS,
            route: "/api/auth/password-recovery/confirm",
            status: 400,
            details: { reason: "invalid_or_expired" },
          });
        }
        return NextResponse.json(
          { error: "Invalid or expired recovery link.", code: "AUTH_PASSWORD_RECOVERY_INVALID_OR_EXPIRED" },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (tx) => {
        const consumed = await tx.passwordResetToken.updateMany({
          where: {
            id: tokenRow.id,
            tokenHash,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            usedAt: now,
            usedIp: requestedIp,
            usedUa: requestedUa,
          },
        });

        if (consumed.count !== 1) {
          throw new Error("AUTH_PASSWORD_RECOVERY_ALREADY_USED");
        }

        try {
          await tx.appUser.update({
            where: { id: tokenRow.userId },
            data: {
              loginPasswordHash: nextHash,
              mustResetPassword: false,
              passwordUpdatedAt: now,
            },
          });
        } catch (error) {
          if (!isAppUserSchemaCompatError(error)) throw error;
          await tx.appUser.update({
            where: { id: tokenRow.userId },
            data: {
              loginPasswordHash: nextHash,
            },
          });
        }

        await tx.passwordResetToken.updateMany({
          where: {
            userId: tokenRow.userId,
            id: { not: tokenRow.id },
            usedAt: null,
          },
          data: {
            usedAt: now,
            usedIp: requestedIp,
            usedUa: requestedUa,
          },
        });
      });
    } catch (error) {
      if (isPasswordRecoveryTokenSchemaCompatError(error)) {
        return NextResponse.json(
          {
            error: "Password recovery is not available yet. Run database migrations.",
            code: "AUTH_PASSWORD_RECOVERY_STORAGE_UNAVAILABLE",
          },
          { status: 503 }
        );
      }
      if (String((error as { message?: string })?.message || "").includes("AUTH_PASSWORD_RECOVERY_ALREADY_USED")) {
        if (ipActor) {
          recordAuthRateEvent({
            eventType: "AUTH_PASSWORD_RECOVERY_CONFIRM_FAILED_IP",
            actor: ipActor,
            windowMs: CONFIRM_RATE_WINDOW_MS,
            route: "/api/auth/password-recovery/confirm",
            status: 400,
            details: { reason: "already_used" },
          });
        }
        return NextResponse.json(
          { error: "Invalid or expired recovery link.", code: "AUTH_PASSWORD_RECOVERY_INVALID_OR_EXPIRED" },
          { status: 400 }
        );
      }
      throw error;
    }

    const res = NextResponse.json({ ok: true });
    if (ipActor) {
      recordAuthRateEvent({
        eventType: "AUTH_PASSWORD_RECOVERY_CONFIRM_SUCCESS_IP",
        actor: ipActor,
        route: "/api/auth/password-recovery/confirm",
        status: 200,
      });
    }
    res.cookies.set({
      name: "assessor_session",
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: String((error as { message?: string })?.message || "Password recovery confirmation failed."),
        code: "AUTH_PASSWORD_RECOVERY_CONFIRM_INTERNAL",
      },
      { status: 500 }
    );
  }
}
