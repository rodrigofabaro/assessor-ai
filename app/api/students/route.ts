import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function normEmail(s: string | null | undefined) {
  const t = (s || "").trim().toLowerCase();
  return t || null;
}

function normRef(s: string | null | undefined) {
  const t = (s || "").trim();
  return t ? t.toUpperCase() : null;
}

function normName(s: string | null | undefined) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t || null;
}

function normCourse(s: string | null | undefined) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t || null;
}

// GET /api/students?query=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") || "").trim();

  const where =
    query.length === 0
      ? {}
      : {
          OR: [
            { fullName: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query.toLowerCase(), mode: "insensitive" as const } },
            { externalRef: { contains: query.toUpperCase(), mode: "insensitive" as const } },
          ],
        };

  const students = await prisma.student.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { id: true, fullName: true, email: true, externalRef: true, courseName: true, createdAt: true, updatedAt: true },
    take: 250,
  });

  // ✅ Always return an array (prevents ".map is not a function")
  return NextResponse.json(students);
}

// POST /api/students
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const fullName = normName(body.fullName ?? body.name);
  const email = normEmail(body.email);
  const externalRef = normRef(body.externalRef ?? body.abNumber ?? body.studentRef);
  const courseName = normCourse(body.courseName ?? body.course ?? body.programme ?? body.programName);

  if (!fullName) return NextResponse.json({ error: "fullName is required." }, { status: 400 });

  try {
    // Prefer creating with stable keys; duplicates prevented by unique constraints.
    const created = await prisma.student.create({
      data: { fullName, email, externalRef, courseName },
      select: { id: true, fullName: true, email: true, externalRef: true, courseName: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json(created);
  } catch (e: any) {
    // Friendly conflict messages
    const msg = String(e?.message || e);
    if (msg.includes("Unique constraint") && msg.includes("email")) {
      return NextResponse.json({ error: "A student with that email already exists." }, { status: 409 });
    }
    if (msg.includes("Unique constraint") && msg.includes("externalRef")) {
      return NextResponse.json({ error: "A student with that AB number (externalRef) already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create student." }, { status: 500 });
  }
}
