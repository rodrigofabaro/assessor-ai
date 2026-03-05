import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDefaultOrganization, normalizeOrgSlug } from "@/lib/organizations/defaults";
import { getRequestSession } from "@/lib/auth/requestSession";

function canManageOrganizations(session: Awaited<ReturnType<typeof getRequestSession>>) {
  if (!session?.userId) return false;
  if (session.userId.startsWith("env:")) return true;
  return !!session.isSuperAdmin;
}

function isOrgSchemaCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const message = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2021" || code === "P2022") return true;
  return (
    message.includes("organization") &&
    ((message.includes("table") && message.includes("does not exist")) ||
      (message.includes("column") && message.includes("does not exist")) ||
      message.includes("unknown argument"))
  );
}

export async function GET() {
  const session = await getRequestSession();
  if (!canManageOrganizations(session)) {
    return NextResponse.json({ error: "Only SUPER_ADMIN can manage organizations." }, { status: 403 });
  }
  try {
    await ensureDefaultOrganization();
    const organizations = await prisma.organization.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { users: true, memberships: true } },
      },
    });
    return NextResponse.json({ organizations });
  } catch (error) {
    if (!isOrgSchemaCompatError(error)) throw error;
    return NextResponse.json({
      organizations: [],
      warning: "Organization table is not available yet in this environment. Run database migrations.",
      code: "ORG_SCHEMA_MISSING",
    });
  }
}

export async function POST(req: Request) {
  const session = await getRequestSession();
  if (!canManageOrganizations(session)) {
    return NextResponse.json({ error: "Only SUPER_ADMIN can create organizations." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const name = String(body?.name || "").trim();
  const slugInput = String(body?.slug || "").trim();
  const slug = normalizeOrgSlug(slugInput || name);

  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ error: "slug is required." }, { status: 400 });
  }

  try {
    const created = await prisma.organization.create({
      data: {
        name,
        slug,
        isActive: true,
      },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ ok: true, organization: created });
  } catch (error: unknown) {
    if (isOrgSchemaCompatError(error)) {
      return NextResponse.json(
        { error: "Organization table is not available yet in this environment. Run database migrations.", code: "ORG_SCHEMA_MISSING" },
        { status: 409 },
      );
    }
    const message = String((error as { message?: string })?.message || "");
    if (message.toLowerCase().includes("unique") && message.toLowerCase().includes("slug")) {
      return NextResponse.json({ error: "Organization slug already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create organization." }, { status: 500 });
  }
}
