import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

export async function PATCH(req: Request, ctx: { params: { unitId: string } }) {
  const unitId = safeStr(ctx?.params?.unitId);
  if (!unitId) return NextResponse.json({ error: "Missing unitId" }, { status: 400 });

  const body = await req.json().catch(() => ({} as any));

  const data: any = {};
  if (typeof body.unitTitle === "string") data.unitTitle = body.unitTitle;
  if (typeof body.specIssue === "string" || body.specIssue === null) data.specIssue = body.specIssue;
  if (typeof body.specVersionLabel === "string" || body.specVersionLabel === null) data.specVersionLabel = body.specVersionLabel;

  // allow updating sourceMeta (e.g., { archived: true })
  if (body.sourceMeta && typeof body.sourceMeta === "object") data.sourceMeta = body.sourceMeta;

  const updated = await prisma.unit.update({
    where: { id: unitId },
    data,
  });

  return NextResponse.json({ ok: true, unit: updated });
}

export async function DELETE(_req: Request, ctx: { params: { unitId: string } }) {
  const unitId = safeStr(ctx?.params?.unitId);
  if (!unitId) return NextResponse.json({ error: "Missing unitId" }, { status: 400 });

  // Hard safety: refuse deleting LOCKED units by default.
  // Library UI uses "safe delete" only when no bindings exist, but we also enforce here.
  const u = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, status: true } });
  if (!u) return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  if (u.status === "LOCKED") {
    return NextResponse.json({ error: "Refuse delete: unit is LOCKED. Archive instead." }, { status: 400 });
  }

  await prisma.unit.delete({ where: { id: unitId } });
  return NextResponse.json({ ok: true });
}
