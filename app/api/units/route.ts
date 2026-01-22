import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const units = await prisma.unit.findMany({
    orderBy: [{ unitCode: "asc" }],
    include: {
      specDocument: true,
      learningOutcomes: {
        orderBy: [{ loCode: "asc" }],
        include: {
          criteria: { orderBy: [{ acCode: "asc" }] },
        },
      },
      assignmentBriefs: {
        orderBy: [{ assignmentCode: "asc" }],
        include: { briefDocument: true },
      },
    },
  });
  return NextResponse.json({ units });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const unitCode = String(body.unitCode || "").trim();
    const unitTitle = String(body.unitTitle || "").trim();
    const specDocumentId = body.specDocumentId ? String(body.specDocumentId) : null;

    if (!unitCode || !unitTitle) {
      return NextResponse.json(
        { error: "Missing unitCode or unitTitle" },
        { status: 400 }
      );
    }

    const unit = await prisma.unit.create({
      data: {
        unitCode,
        unitTitle,
        specDocumentId,
      },
    });

    return NextResponse.json({ unit });
  } catch (err) {
    console.error("UNIT_CREATE_ERROR:", err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
