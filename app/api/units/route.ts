import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
  } catch (err: any) {
    console.error("UNITS_GET_ERROR:", err);
    return NextResponse.json(
      { error: "UNITS_GET_ERROR", message: String(err?.message || err) },
      { status: 500 }
    );
  }
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
  } catch (err: any) {
    console.error("UNIT_CREATE_ERROR:", err);
    return NextResponse.json(
      { error: "UNIT_CREATE_ERROR", message: String(err?.message || err) },
      { status: 500 }
    );
  }
}
