import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canSendInviteEmail, sendPasswordRecoveryEmail } from "@/lib/auth/inviteEmail";
import { generateRandomPassword, hashPassword, normalizeLoginEmail } from "@/lib/auth/password";

export const runtime = "nodejs";

const GENERIC_SUCCESS_MESSAGE = "If the account exists, a recovery email has been sent.";

function toSafeString(value: unknown) {
  return String(value || "").trim();
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

type RecoveryUser = {
  id: string;
  email: string | null;
  fullName?: string | null;
  loginPasswordHash: string | null;
  mustResetPassword?: boolean | null;
  passwordUpdatedAt?: Date | null;
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
        mustResetPassword: true,
        passwordUpdatedAt: true,
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

async function writeRecoveryCredentials(input: { userId: string; nextHash: string }) {
  try {
    await prisma.appUser.update({
      where: { id: input.userId },
      data: {
        loginPasswordHash: input.nextHash,
        mustResetPassword: true,
        passwordUpdatedAt: new Date(),
      },
    });
    return;
  } catch (error) {
    if (!isAppUserSchemaCompatError(error)) throw error;
  }

  await prisma.appUser.update({
    where: { id: input.userId },
    data: {
      loginPasswordHash: input.nextHash,
    },
  });
}

async function restoreRecoveryCredentials(input: {
  userId: string;
  previousHash: string | null;
  previousMustResetPassword: boolean;
  previousPasswordUpdatedAt: Date | null;
}) {
  try {
    await prisma.appUser.update({
      where: { id: input.userId },
      data: {
        loginPasswordHash: input.previousHash,
        mustResetPassword: input.previousMustResetPassword,
        passwordUpdatedAt: input.previousPasswordUpdatedAt,
      },
    });
    return;
  } catch (error) {
    if (!isAppUserSchemaCompatError(error)) throw error;
  }

  await prisma.appUser.update({
    where: { id: input.userId },
    data: {
      loginPasswordHash: input.previousHash,
    },
  });
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

    const temporaryPassword = generateRandomPassword();
    const nextHash = hashPassword(temporaryPassword);
    const previousState = {
      previousHash: user.loginPasswordHash,
      previousMustResetPassword: !!user.mustResetPassword,
      previousPasswordUpdatedAt: user.passwordUpdatedAt || null,
    };

    await writeRecoveryCredentials({ userId: user.id, nextHash });

    const sendResult = await sendPasswordRecoveryEmail({
      to: user.email,
      fullName: String(user.fullName || "").trim(),
      password: temporaryPassword,
    });

    if (!sendResult.sent) {
      try {
        await restoreRecoveryCredentials({
          userId: user.id,
          ...previousState,
        });
      } catch {
        // Best-effort rollback. Return explicit failure either way.
      }
      return NextResponse.json(
        {
          error: String(sendResult.error || "Unable to send recovery email.").trim(),
          code: "AUTH_PASSWORD_RECOVERY_EMAIL_FAILED",
        },
        { status: 502 }
      );
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
