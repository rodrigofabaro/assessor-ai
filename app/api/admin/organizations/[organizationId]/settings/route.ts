import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRequestSession } from "@/lib/auth/requestSession";
import { encryptOrganizationSecret } from "@/lib/security/orgSecrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ organizationId: string }>;
};

function isOrgSettingsCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const message = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") return true;
  return (
    message.includes("organizationsetting") ||
    message.includes("organizationsecret") ||
    message.includes("organizationmembership") ||
    message.includes("platformrole") ||
    message.includes("organizationid") ||
    (message.includes("unknown argument") && message.includes("organization")) ||
    (message.includes("unknown argument") && message.includes("membership")) ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("table") && message.includes("does not exist"))
  );
}

async function loadOrganizationConfigSnapshot(organizationId: string) {
  try {
    const [settings, secrets] = await Promise.all([
      prisma.organizationSetting.findUnique({
        where: { organizationId },
        select: { id: true, config: true, createdAt: true, updatedAt: true },
      }),
      prisma.organizationSecret.findMany({
        where: { organizationId },
        orderBy: [{ secretName: "asc" }],
        select: { id: true, secretName: true, rotatedAt: true, createdAt: true, updatedAt: true },
      }),
    ]);
    return {
      settings: settings || null,
      secrets,
      warning: "" as string,
    };
  } catch (error) {
    if (!isOrgSettingsCompatError(error)) throw error;
    return {
      settings: null,
      secrets: [] as Array<{
        id: string;
        secretName: string;
        rotatedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>,
      warning: "Organization settings storage is not available yet in this environment. Run database migrations to enable config and secret storage.",
    };
  }
}

function normalizeSecretName(input: unknown) {
  return String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function assertOrganizationAccess(organizationId: string) {
  const session = await getRequestSession();
  if (!session?.userId) {
    return { ok: false as const, status: 401, error: "Authentication required.", code: "AUTH_REQUIRED" };
  }

  const trimmedOrgId = String(organizationId || "").trim();
  if (!trimmedOrgId) {
    return { ok: false as const, status: 400, error: "organizationId is required.", code: "ORG_ID_REQUIRED" };
  }

  if (session.userId.startsWith("env:") || session.isSuperAdmin) {
    return { ok: true as const, organizationId: trimmedOrgId };
  }

  const activeOrgId = String(session.orgId || "").trim();
  if (session.role === "ADMIN" && activeOrgId && activeOrgId === trimmedOrgId) {
    return { ok: true as const, organizationId: trimmedOrgId };
  }

  try {
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        userId: session.userId,
        organizationId: trimmedOrgId,
        isActive: true,
        role: "ORG_ADMIN",
        organization: { isActive: true },
      },
      select: { id: true },
    });
    if (membership?.id) {
      return { ok: true as const, organizationId: trimmedOrgId };
    }
  } catch (error) {
    if (!isOrgSettingsCompatError(error)) throw error;
    if (session.role === "ADMIN" && activeOrgId && activeOrgId === trimmedOrgId) {
      return { ok: true as const, organizationId: trimmedOrgId };
    }
  }

  if (session.role !== "ADMIN") {
    return { ok: false as const, status: 403, error: "Only organization admins can change settings.", code: "ROLE_FORBIDDEN" };
  }

  return {
    ok: false as const,
    status: 403,
    error: "Organization scope mismatch.",
    code: "ORG_SCOPE_MISMATCH",
  };
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { organizationId } = await ctx.params;
  const access = await assertOrganizationAccess(organizationId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: access.organizationId },
    select: { id: true, slug: true, name: true, isActive: true },
  });

  if (!organization) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  const snapshot = await loadOrganizationConfigSnapshot(access.organizationId);

  return NextResponse.json({
    organization,
    settings: snapshot.settings,
    secrets: snapshot.secrets,
    ...(snapshot.warning ? { warning: snapshot.warning } : {}),
  });
}

export async function PUT(req: Request, ctx: RouteContext) {
  const { organizationId } = await ctx.params;
  const access = await assertOrganizationAccess(organizationId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });
  }
  const session = await getRequestSession();
  const actor = sessionActor(session);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const config = body?.config;
  const secretsInput = body?.secrets;

  if (config !== undefined && !isPlainObject(config)) {
    return NextResponse.json({ error: "config must be an object when provided." }, { status: 400 });
  }
  if (secretsInput !== undefined && !isPlainObject(secretsInput)) {
    return NextResponse.json({ error: "secrets must be an object when provided." }, { status: 400 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: access.organizationId },
    select: { id: true, isActive: true },
  });
  if (!organization?.isActive) {
    return NextResponse.json({ error: "Organization not found or inactive." }, { status: 404 });
  }

  const secretOps = Object.entries((secretsInput || {}) as Record<string, unknown>)
    .map(([k, rawValue]) => {
      const secretName = normalizeSecretName(k);
      const value = String(rawValue || "").trim();
      if (!secretName) return null;
      return { secretName, value };
    })
    .filter((row): row is { secretName: string; value: string } => !!row);

  try {
    await prisma.$transaction(async (tx) => {
      if (config !== undefined) {
        await tx.organizationSetting.upsert({
          where: { organizationId: access.organizationId },
          update: { config: toInputJson(config as Record<string, unknown>) },
          create: {
            organizationId: access.organizationId,
            config: toInputJson(config as Record<string, unknown>),
          },
        });
      }

      for (const row of secretOps) {
        if (!row.value) {
          await tx.organizationSecret.deleteMany({
            where: { organizationId: access.organizationId, secretName: row.secretName },
          });
          continue;
        }

        const encryptedValue = encryptOrganizationSecret(row.value);
        await tx.organizationSecret.upsert({
          where: {
            organizationId_secretName: {
              organizationId: access.organizationId,
              secretName: row.secretName,
            },
          },
          update: {
            encryptedValue,
            rotatedAt: new Date(),
            meta: { updatedBy: actor, updatedAt: new Date().toISOString() },
          },
          create: {
            organizationId: access.organizationId,
            secretName: row.secretName,
            encryptedValue,
            rotatedAt: new Date(),
            meta: { createdBy: actor, createdAt: new Date().toISOString() },
          },
        });
      }
    });
  } catch (error) {
    if (!isOrgSettingsCompatError(error)) throw error;
    return NextResponse.json(
      {
        error: "Organization settings storage is not ready in this environment. Run database migrations, then retry.",
        code: "ORG_SETTINGS_SCHEMA_MISSING",
      },
      { status: 409 }
    );
  }

  const snapshot = await loadOrganizationConfigSnapshot(access.organizationId);

  return NextResponse.json({
    ok: true,
    settings: snapshot.settings,
    secrets: snapshot.secrets,
    ...(snapshot.warning ? { warning: snapshot.warning } : {}),
  });
}

function sessionActor(session: Awaited<ReturnType<typeof getRequestSession>>) {
  if (!session?.userId) return "system";
  return session.userId;
}
function toInputJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}
