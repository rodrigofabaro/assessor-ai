import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ unitId: string }> }
) {
  try {
    const { unitId } = await params;
    const body = await req.json();

    const loCode = String(body.loCode || "").trim().toUpperCase();
    const description = String(body.description || "").trim();

    if (!loCode || !description) {
      return NextResponse.json(
        { error: "Missing loCode or description" },
        { status: 400 }
      );
    }

    const lo = await prisma.learningOutcome.create({
      data: {
        unitId,
        loCode,
        description,
      },
    });

    return NextResponse.json({ learningOutcome: lo });
  } catch (err) {
    console.error("LO_CREATE_ERROR:", err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
