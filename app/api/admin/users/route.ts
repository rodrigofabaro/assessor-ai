import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const users = await prisma.appUser.findMany({
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
  });
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const fullName = String(body?.fullName || "").trim();
  const emailRaw = String(body?.email || "").trim().toLowerCase();
  const role = String(body?.role || "ADMIN").trim().toUpperCase();
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : true;

  if (!fullName) {
    return NextResponse.json({ error: "fullName is required." }, { status: 400 });
  }

  const user = await prisma.appUser.create({
    data: {
      fullName,
      email: emailRaw || null,
      role: role || "ADMIN",
      isActive,
    },
  });
  return NextResponse.json({ ok: true, user });
}

