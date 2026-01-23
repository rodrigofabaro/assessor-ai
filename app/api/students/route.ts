import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const students = await prisma.student.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(students);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; studentRef?: string | null; email?: string | null };
    const name = (body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    const created = await prisma.student.create({
      data: {
        name,
        studentRef: body.studentRef ?? null,
        email: body.email ?? null,
      },
    });

    return NextResponse.json(created);
  } catch (e: any) {
    // Handle unique constraint errors (email)
    const msg = typeof e?.message === "string" ? e.message : String(e);
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: "That email is already used by another student." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create student." }, { status: 500 });
  }
}
