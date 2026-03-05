import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canSendInviteEmail, sendPasswordRecoveryEmail } from "@/lib/auth/inviteEmail";
import { normalizeLoginEmail } from "@/lib/auth/password";
import {
  buildPasswordRecoveryUrl,
  generatePasswordRecoveryToken,
  getPasswordRecoveryTtlMinutes,
  hashPasswordRecoveryToken,
} from "@/lib/auth/passwordRecoveryToken";

export const runtime = "nodejs";

const GENERIC_SUCCESS_MESSAGE = "If the account exists, a recovery email has been sent.";
const REQUESTS_PER_USER_PER_HOUR = 5;

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
    return { username: toSafeString(body.username) };
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    return { username: toSafeString(form?.get("username")) };
  }
  return { username: "" };
}

function isAppUserSchemaCompatError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return (
    message.includes("loginenabled") ||
    message.includes("mustresetpassword") ||
    message.includes("passwordupdatedat") ||
    message.includes("isactive") ||
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

type RecoveryUser = {
  id: string;
  email: string | null;
  fullName?: string | null;
  loginPasswordHash: string | null;
};

async function findRecoveryUser(email: string): Promise<RecoveryUser | null> {
  try {
    const user = await prisma.appUser.findFirst({
      where: { email, isActive: true, loginEnabled: true },
      select: {
        id: true,
        email: true,
        fullName: true,
        loginPasswordHash: true,
      },
    });
    return (user as RecoveryUser | null) || null;
  } catch (error) {
    if (!isAppUserSchemaCompatError(error)) throw error;
  }

  try {
    const user = await prisma.appUser.findFirst({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        loginPasswordHash: true,
      },
    });
    return (user as RecoveryUser | null) || null;
  } catch (error) {
    if (!isAppUserSchemaCompatError(error)) throw error;
  }

  const user = await prisma.appUser.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      fullName: true,
      loginPasswordHash: true,
    },
  });
  return (user as RecoveryUser | null) || null;
}

export async function POST(req: Request) {
  try {
    const { username } = await parsePayload(req);
    if (!username) {
      return NextResponse.json(
        { error: "Username is required.", code: "AUTH_PASSWORD_RECOVERY_REQUIRED_FIELDS" },
        { status: 400 }
      );
    }

    if (!canSendInviteEmail()) {
      return NextResponse.json(
        {
          error: "Password recovery email is not configured.",
          code: "AUTH_PASSWORD_RECOVERY_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    const email = normalizeLoginEmail(username);
    if (!email) {
      return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE });
    }

    const user = await findRecoveryUser(email);
    if (!user?.id || !user.email || user.loginPasswordHash === null) {
      return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    try {
      const recentRequests = await prisma.passwordResetToken.count({
        where: {
          userId: user.id,
          createdAt: { gt: oneHourAgo },
        },
      });
      if (recentRequests >= REQUESTS_PER_USER_PER_HOUR) {
        return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE });
      }
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
      throw error;
    }

    let tokenHash = "";
    let rawToken = "";
    try {
      rawToken = generatePasswordRecoveryToken();
      tokenHash = hashPasswordRecoveryToken(rawToken);
    } catch {
      return NextResponse.json(
        {
          error: "Password recovery token service is not configured.",
          code: "AUTH_PASSWORD_RECOVERY_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    const expiresMinutes = getPasswordRecoveryTtlMinutes();
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);
    const requestedIp = pickClientIp(req);
    const requestedUa = pickClientUserAgent(req);

    let resetId = "";
    try {
      const created = await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date(), usedIp: requestedIp, usedUa: requestedUa },
        });
        return tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
            requestedIp,
            requestedUa,
          },
          select: { id: true },
        });
      });
      resetId = created.id;
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
      throw error;
    }

    const resetUrl = buildPasswordRecoveryUrl({
      request: req,
      resetId,
      token: rawToken,
    });

    const sendResult = await sendPasswordRecoveryEmail({
      to: user.email,
      fullName: String(user.fullName || "").trim(),
      resetUrl,
      expiresMinutes,
    });

    if (!sendResult.sent) {
      try {
        await prisma.passwordResetToken.updateMany({
          where: { id: resetId, usedAt: null },
          data: { usedAt: new Date(), usedIp: requestedIp, usedUa: requestedUa },
        });
      } catch {
        // best effort: one-time token gets invalidated when delivery fails
      }
    }

    return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: String((error as { message?: string })?.message || "Password recovery failed."),
        code: "AUTH_PASSWORD_RECOVERY_INTERNAL",
      },
      { status: 500 }
    );
  }
}
