import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";

function isOrgScopeCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2022") return true;
  if (msg.includes("organizationid") && msg.includes("does not exist")) return true;
  if (msg.includes("unknown argument") && msg.includes("organizationid")) return true;
  return false;
}

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
  let organizationId: string | null = null;
  try {
    organizationId = await getRequestOrganizationId();
  } catch {}
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

  let students;
  try {
    students = await prisma.student.findMany({
      where: addOrganizationReadScope(where as any, organizationId) as any,
      orderBy: { createdAt: "desc" },
      select: { id: true, fullName: true, email: true, externalRef: true, courseName: true, createdAt: true, updatedAt: true },
      take: 250,
    });
  } catch (error) {
    if (!organizationId || !isOrgScopeCompatError(error)) throw error;
    students = await prisma.student.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      select: { id: true, fullName: true, email: true, externalRef: true, courseName: true, createdAt: true, updatedAt: true },
      take: 250,
    });
  }

  // ✅ Always return an array (prevents ".map is not a function")
  return NextResponse.json(students);
}

// POST /api/students
export async function POST(req: Request) {
  let organizationId: string | null = null;
  try {
    organizationId = await getRequestOrganizationId();
  } catch {}
  const body = await req.json().catch(() => ({}));

  const fullName = normName(body.fullName ?? body.name);
  const email = normEmail(body.email);
  const externalRef = normRef(body.externalRef ?? body.abNumber ?? body.studentRef);
  const courseName = normCourse(body.courseName ?? body.course ?? body.programme ?? body.programName);

  if (!fullName) return NextResponse.json({ error: "fullName is required." }, { status: 400 });

  try {
    // Prefer creating with stable keys; duplicates prevented by unique constraints.
    const baseData = { fullName, email, externalRef, courseName };
    let created;
    try {
      created = await prisma.student.create({
        data: organizationId ? { ...baseData, organizationId } : baseData,
        select: { id: true, fullName: true, email: true, externalRef: true, courseName: true, createdAt: true, updatedAt: true },
      });
    } catch (createErr) {
      if (!organizationId || !isOrgScopeCompatError(createErr)) throw createErr;
      created = await prisma.student.create({
        data: baseData,
        select: { id: true, fullName: true, email: true, externalRef: true, courseName: true, createdAt: true, updatedAt: true },
      });
    }
    return NextResponse.json(created);
  } catch (e: unknown) {
    // Friendly conflict messages
    const msg = String((e as { message?: string } | null)?.message || e);
    if (msg.includes("Unique constraint") && msg.includes("email")) {
      return NextResponse.json({ error: "A student with that email already exists." }, { status: 409 });
    }
    if (msg.includes("Unique constraint") && msg.includes("externalRef")) {
      return NextResponse.json({ error: "A student with that AB number (externalRef) already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create student." }, { status: 500 });
  }
}
