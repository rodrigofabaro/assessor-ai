import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";

type RouteContext = {
  params: Promise<{ briefId: string }>;
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const { briefId } = await ctx.params;
    const organizationId = await getRequestOrganizationId();

    if (!briefId) {
      return NextResponse.json({ error: "Missing briefId" }, { status: 400 });
    }

    const body = await req.json();
    const criterionIds: string[] = Array.isArray(body?.criterionIds)
      ? body.criterionIds.map(String)
      : [];

    const brief = await prisma.assignmentBrief.findFirst({
      where: addOrganizationReadScope({ id: briefId }, organizationId) as any,
      select: { id: true, unitId: true, organizationId: true },
    });
    if (!brief) {
      return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    if (criterionIds.length > 0) {
      const visibleCriteria = await prisma.assessmentCriterion.findMany({
        where: {
          id: { in: criterionIds },
          learningOutcome: { unitId: brief.unitId },
        } as any,
        select: { id: true },
      });
      if (visibleCriteria.length !== new Set(criterionIds).size) {
        return NextResponse.json({ error: "One or more criteria are not valid for this brief." }, { status: 400 });
      }
    }

    // Replace existing mapping with the provided list
    await prisma.assignmentCriterionMap.deleteMany({
      where: { assignmentBriefId: brief.id },
    });

    if (criterionIds.length > 0) {
      await prisma.assignmentCriterionMap.createMany({
        data: criterionIds.map((assessmentCriterionId) => ({
          assignmentBriefId: brief.id,
          assessmentCriterionId,
        })),
      });
    }

    const refreshed = await prisma.assignmentBrief.findFirst({
      where: addOrganizationReadScope({ id: brief.id }, String(brief.organizationId || organizationId || "").trim() || null) as any,
      include: {
        unit: true,
        criteriaMaps: {
          include: {
            assessmentCriterion: { include: { learningOutcome: true } },
          },
        },
      },
    });

    return NextResponse.json({ brief: refreshed });
  } catch (err) {
    console.error("BRIEF_MAP_ERROR:", err);
    return NextResponse.json({ error: "Map failed" }, { status: 500 });
  }
}
