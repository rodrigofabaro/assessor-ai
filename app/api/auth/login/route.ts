import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSignedSessionToken, getSessionCookieName, hasSessionSecret } from "@/lib/auth/session";
import { parseRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/prisma";
import { normalizeLoginEmail, verifyPassword } from "@/lib/auth/password";

export const runtime = "nodejs";

const ONE_DAY_SECONDS = 60 * 60 * 24;

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function secureCompare(input: string, expected: string) {
  const inputHash = crypto.createHash("sha256").update(input).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

async function tryAuthenticateAppUser(username: string, password: string) {
  const email = normalizeLoginEmail(username);
  if (!email || !password) return null;

  const user = await prisma.appUser.findFirst({
    where: { email, isActive: true, loginEnabled: true },
    select: {
      id: true,
      role: true,
      loginPasswordHash: true,
    },
  });
  if (!user?.loginPasswordHash) return null;
  if (!verifyPassword(password, user.loginPasswordHash)) return null;

  const role = parseRole(user.role);
  if (!role) return null;

  return { userId: user.id, role, source: "app-user" as const };
}

async function parseCredentials(req: Request) {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      username: toSafeString(body.username),
      password: toSafeString(body.password),
    };
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    return {
      username: toSafeString(form?.get("username")),
      password: toSafeString(form?.get("password")),
    };
  }
  return { username: "", password: "" };
}

export async function POST(req: Request) {
  const expectedUsername = toSafeString(process.env.AUTH_LOGIN_USERNAME);
  const expectedPassword = toSafeString(process.env.AUTH_LOGIN_PASSWORD);
  const envRole = parseRole(process.env.AUTH_LOGIN_ROLE) || "ADMIN";

  if (!hasSessionSecret()) {
    return NextResponse.json({ error: "AUTH_SESSION_SECRET is not configured.", code: "AUTH_SESSION_SECRET_MISSING" }, { status: 503 });
  }

  const { username, password } = await parseCredentials(req);
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required.", code: "AUTH_CREDENTIALS_REQUIRED" }, { status: 400 });
  }

  let auth: { userId: string; role: "ADMIN" | "ASSESSOR" | "IV"; source: "app-user" | "env" } | null = null;
  try {
    auth = await tryAuthenticateAppUser(username, password);
  } catch {
    auth = null;
  }

  if (!auth && expectedUsername && expectedPassword) {
    const isEnvValid = secureCompare(username, expectedUsername) && secureCompare(password, expectedPassword);
    if (isEnvValid) {
      auth = { userId: `env:${expectedUsername}`, role: envRole, source: "env" };
    }
  }

  if (!auth) {
    return NextResponse.json(
      { error: "Invalid credentials.", code: "AUTH_INVALID_CREDENTIALS" },
      { status: 401 }
    );
  }

  const token = createSignedSessionToken({
    userId: auth.userId,
    role: auth.role,
    ttlSeconds: ONE_DAY_SECONDS,
  });

  const res = NextResponse.json({ ok: true, role: auth.role, source: auth.source });
  res.cookies.set({
    name: getSessionCookieName(),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_DAY_SECONDS,
  });
  // Clear legacy role cookie so middleware relies only on signed session.
  res.cookies.set({
    name: "assessor_role",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
