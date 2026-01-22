import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { briefId: string } }
) {
  try {
    const { briefId } = params;
    const body = await req.json();
    const criterionIds = Array.isArray(body.criterionIds) ? body.criterionIds.map(String) : [];

    // Replace existing mapping with the provided list
    await prisma.assignmentCriterionMap.deleteMany({
      where: { assignmentBriefId: briefId },
    });

    if (criterionIds.length > 0) {
      await prisma.assignmentCriterionMap.createMany({
        data: criterionIds.map((assessmentCriterionId: string) => ({
          assignmentBriefId: briefId,
          assessmentCriterionId,
        })),
      });
    }

    const refreshed = await prisma.assignmentBrief.findUnique({
      where: { id: briefId },
      include: {
        unit: true,
        criteriaMaps: { include: { assessmentCriterion: { include: { learningOutcome: true } } } },
      },
    });

    return NextResponse.json({ brief: refreshed });
  } catch (err) {
    console.error("BRIEF_MAP_ERROR:", err);
    return NextResponse.json({ error: "Map failed" }, { status: 500 });
  }
}
