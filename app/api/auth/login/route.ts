import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSignedSessionToken, getSessionCookieName, hasSessionSecret } from "@/lib/auth/session";
import { parseRole } from "@/lib/auth/rbac";

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
  const role = parseRole(process.env.AUTH_LOGIN_ROLE) || "ADMIN";

  if (!hasSessionSecret()) {
    return NextResponse.json({ error: "AUTH_SESSION_SECRET is not configured.", code: "AUTH_SESSION_SECRET_MISSING" }, { status: 503 });
  }
  if (!expectedUsername || !expectedPassword) {
    return NextResponse.json({ error: "Login credentials are not configured.", code: "AUTH_LOGIN_CREDENTIALS_MISSING" }, { status: 503 });
  }

  const { username, password } = await parseCredentials(req);
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required.", code: "AUTH_CREDENTIALS_REQUIRED" }, { status: 400 });
  }

  const isValid = secureCompare(username, expectedUsername) && secureCompare(password, expectedPassword);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials.", code: "AUTH_INVALID_CREDENTIALS" }, { status: 401 });
  }

  const token = createSignedSessionToken({
    userId: `env:${expectedUsername}`,
    role,
    ttlSeconds: ONE_DAY_SECONDS,
  });

  const res = NextResponse.json({ ok: true, role });
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
