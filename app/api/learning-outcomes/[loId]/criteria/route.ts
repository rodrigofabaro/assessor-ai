import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { loId: string } }
) {
  try {
    const { loId } = params;
    const body = await req.json();

    const acCode = String(body.acCode || "").trim().toUpperCase();
    const gradeBand = String(body.gradeBand || "").trim().toUpperCase();
    const description = String(body.description || "").trim();

    if (!acCode || !gradeBand || !description) {
      return NextResponse.json(
        { error: "Missing acCode, gradeBand, or description" },
        { status: 400 }
      );
    }

    const criterion = await prisma.assessmentCriterion.create({
      data: {
        learningOutcomeId: loId,
        acCode,
        gradeBand: gradeBand as any,
        description,
      },
    });

    return NextResponse.json({ criterion });
  } catch (err) {
    console.error("CRITERION_CREATE_ERROR:", err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
