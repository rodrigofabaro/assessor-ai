import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";

export async function GET() {
  const organizationId = await getRequestOrganizationId();
  const briefs = await prisma.assignmentBrief.findMany({
    where: addOrganizationReadScope({}, organizationId) as any,
    orderBy: [{ createdAt: "desc" }],
    include: {
      unit: true,
      briefDocument: true,
      criteriaMaps: {
        include: { assessmentCriterion: { include: { learningOutcome: true } } },
      },
    },
  });
  return NextResponse.json({ briefs });
}

export async function POST(req: Request) {
  try {
    const organizationId = await getRequestOrganizationId();
    const body = await req.json();
    const unitId = String(body.unitId || "").trim();
    const assignmentCode = String(body.assignmentCode || "").trim().toUpperCase();
    const title = String(body.title || "").trim();
    const briefDocumentId = body.briefDocumentId ? String(body.briefDocumentId) : null;

    if (!unitId || !assignmentCode || !title) {
      return NextResponse.json(
        { error: "Missing unitId, assignmentCode, or title" },
        { status: 400 }
      );
    }

    const unit = await prisma.unit.findFirst({
      where: addOrganizationReadScope({ id: unitId }, organizationId) as any,
      select: { id: true, organizationId: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    if (briefDocumentId) {
      const briefDocument = await prisma.referenceDocument.findFirst({
        where: addOrganizationReadScope({ id: briefDocumentId }, String(unit.organizationId || organizationId || "").trim() || null) as any,
        select: { id: true },
      });
      if (!briefDocument) {
        return NextResponse.json({ error: "Brief document not found" }, { status: 404 });
      }
    }

    const brief = await prisma.assignmentBrief.create({
      data: {
        unitId,
        assignmentCode,
        title,
        briefDocumentId,
        organizationId: String(unit.organizationId || organizationId || "").trim() || null,
      },
    });

    return NextResponse.json({ brief });
  } catch (err) {
    console.error("BRIEF_CREATE_ERROR:", err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
