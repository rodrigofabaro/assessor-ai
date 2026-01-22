import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const briefs = await prisma.assignmentBrief.findMany({
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

    const brief = await prisma.assignmentBrief.create({
      data: {
        unitId,
        assignmentCode,
        title,
        briefDocumentId,
      },
    });

    return NextResponse.json({ brief });
  } catch (err) {
    console.error("BRIEF_CREATE_ERROR:", err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
