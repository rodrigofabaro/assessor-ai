import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_ORG_ID,
  DEFAULT_ORG_SLUG,
  ensureDefaultOrganization,
  normalizeOrgSlug,
} from "@/lib/organizations/defaults";
import { getRequestSession } from "@/lib/auth/requestSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ organizationId: string }>;
};

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

function isUniqueConstraintError(error: unknown, fieldHint: string) {
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  return message.includes("unique") && message.includes(fieldHint.toLowerCase());
}

async function loadOrganization(organizationId: string) {
  const orgId = String(organizationId || "").trim();
  if (!orgId) return null;
  try {
    return await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            memberships: true,
            students: true,
            assignments: true,
            submissions: true,
            referenceDocuments: true,
            units: true,
            assignmentBriefs: true,
          },
        },
      },
    });
  } catch (error) {
    if (!isOrgSchemaCompatError(error)) throw error;
    return null;
  }
}

function isProtectedDefaultOrganization(input: { id?: string | null; slug?: string | null }) {
  const id = String(input.id || "").trim();
  const slug = String(input.slug || "").trim().toLowerCase();
  return id === DEFAULT_ORG_ID || slug === DEFAULT_ORG_SLUG;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await getRequestSession();
  if (!canManageOrganizations(session)) {
    return NextResponse.json({ error: "Only SUPER_ADMIN can manage organizations." }, { status: 403 });
  }

  const { organizationId } = await ctx.params;
  const organization = await loadOrganization(organizationId);
  if (!organization) {
    return NextResponse.json({ error: "Organization not found or schema unavailable.", code: "ORG_SCHEMA_MISSING" }, { status: 404 });
  }

  return NextResponse.json({ organization });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await getRequestSession();
  if (!canManageOrganizations(session)) {
    return NextResponse.json({ error: "Only SUPER_ADMIN can update organizations." }, { status: 403 });
  }

  await ensureDefaultOrganization().catch(() => null);
  const { organizationId } = await ctx.params;
  const current = await loadOrganization(organizationId);
  if (!current) {
    return NextResponse.json({ error: "Organization not found or schema unavailable.", code: "ORG_SCHEMA_MISSING" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const nameRaw = body?.name;
  const slugRaw = body?.slug;
  const isActiveRaw = body?.isActive;

  const updateData: Record<string, unknown> = {};
  if (nameRaw !== undefined) {
    const name = String(nameRaw || "").trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
    updateData.name = name;
  }
  if (slugRaw !== undefined) {
    const slug = normalizeOrgSlug(slugRaw);
    if (!slug) return NextResponse.json({ error: "slug cannot be empty." }, { status: 400 });
    updateData.slug = slug;
  }
  if (typeof isActiveRaw === "boolean") {
    if (!isActiveRaw && isProtectedDefaultOrganization(current)) {
      return NextResponse.json({ error: "Default organization cannot be deactivated." }, { status: 400 });
    }
    updateData.isActive = isActiveRaw;
  }

  if (!Object.keys(updateData).length) {
    return NextResponse.json({ error: "No valid fields provided for update." }, { status: 400 });
  }

  try {
    const updated = await prisma.organization.update({
      where: { id: current.id },
      data: updateData,
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ ok: true, organization: updated });
  } catch (error: unknown) {
    if (isOrgSchemaCompatError(error)) {
      return NextResponse.json(
        { error: "Organization schema is not available in this environment.", code: "ORG_SCHEMA_MISSING" },
        { status: 409 },
      );
    }
    if (isUniqueConstraintError(error, "slug")) {
      return NextResponse.json({ error: "Organization slug already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update organization." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await getRequestSession();
  if (!canManageOrganizations(session)) {
    return NextResponse.json({ error: "Only SUPER_ADMIN can delete organizations." }, { status: 403 });
  }

  await ensureDefaultOrganization().catch(() => null);
  const { organizationId } = await ctx.params;
  const current = await loadOrganization(organizationId);
  if (!current) {
    return NextResponse.json({ error: "Organization not found or schema unavailable.", code: "ORG_SCHEMA_MISSING" }, { status: 404 });
  }

  if (isProtectedDefaultOrganization(current)) {
    return NextResponse.json({ error: "Default organization cannot be deleted." }, { status: 400 });
  }

  const relatedCount =
    Number(current._count.users || 0) +
    Number(current._count.memberships || 0) +
    Number(current._count.students || 0) +
    Number(current._count.assignments || 0) +
    Number(current._count.submissions || 0) +
    Number(current._count.referenceDocuments || 0) +
    Number(current._count.units || 0) +
    Number(current._count.assignmentBriefs || 0);

  if (relatedCount > 0) {
    return NextResponse.json(
      {
        error:
          "Organization has related data and cannot be deleted. Deactivate it instead.",
        code: "ORGANIZATION_HAS_DATA",
      },
      { status: 409 }
    );
  }

  try {
    await prisma.organization.delete({ where: { id: current.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isOrgSchemaCompatError(error)) {
      return NextResponse.json(
        { error: "Organization schema is not available in this environment.", code: "ORG_SCHEMA_MISSING" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to delete organization." }, { status: 500 });
  }
}
