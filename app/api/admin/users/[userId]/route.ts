import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const { userId } = await ctx.params;
  const body = await req.json().catch(() => ({} as any));

  const fullName = body?.fullName !== undefined ? String(body.fullName || "").trim() : undefined;
  const email = body?.email !== undefined ? String(body.email || "").trim().toLowerCase() : undefined;
  const role = body?.role !== undefined ? String(body.role || "").trim().toUpperCase() : undefined;
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : undefined;

  if (fullName !== undefined && !fullName) {
    return NextResponse.json({ error: "fullName cannot be empty." }, { status: 400 });
  }

  const updated = await prisma.appUser.update({
    where: { id: userId },
    data: {
      fullName,
      email: email === undefined ? undefined : email || null,
      role,
      isActive,
    },
  });

  return NextResponse.json({ ok: true, user: updated });
}

