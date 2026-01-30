import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

type Ctx = { params: Promise<{ unitId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { unitId } = await params;
  const id = safeStr(unitId);
  if (!id) return NextResponse.json({ error: "Missing unitId" }, { status: 400 });

  const body = await req.json().catch(() => ({} as any));
  const data: any = {};

  // allow updating unitCode too
  if (typeof body.unitCode === "string") data.unitCode = body.unitCode.trim();

  if (typeof body.unitTitle === "string") data.unitTitle = body.unitTitle;
  if (typeof body.specIssue === "string" || body.specIssue === null) data.specIssue = body.specIssue;
  if (typeof body.specVersionLabel === "string" || body.specVersionLabel === null)
    data.specVersionLabel = body.specVersionLabel;

  // allow updating sourceMeta (e.g., { archived: true })
  if (body.sourceMeta && typeof body.sourceMeta === "object") data.sourceMeta = body.sourceMeta;

  try {
    const updated = await prisma.unit.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ok: true, unit: updated });
  } catch (err: any) {
    console.error("UNIT_PATCH_ERROR:", err);
    return NextResponse.json(
      { error: "UNIT_PATCH_ERROR", message: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { unitId } = await params;
  const id = safeStr(unitId);
  if (!id) return NextResponse.json({ error: "Missing unitId" }, { status: 400 });

  try {
    // Pull relations that can block deletes
    const unit = await prisma.unit.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        assignmentBriefs: { select: { id: true } },
        learningOutcomes: {
          select: {
            id: true,
            criteria: { select: { id: true } },
          },
        },
      },
    });

    if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

    const briefIds = unit.assignmentBriefs.map((b) => b.id);
    const loIds = unit.learningOutcomes.map((lo) => lo.id);
    const criterionIds = unit.learningOutcomes.flatMap((lo) => lo.criteria.map((c) => c.id));

    // Hard safety: if briefs exist, do NOT delete
    if (briefIds.length > 0) {
      return NextResponse.json(
        { error: `Refuse delete: ${briefIds.length} brief(s) are bound to this unit. Archive instead.` },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1) Criteria maps referencing criteria (cleanup)
      if (criterionIds.length > 0) {
        await tx.assignmentCriterionMap.deleteMany({
          where: { assessmentCriterionId: { in: criterionIds } },
        });
      }

      // 2) Assessment criteria
      if (loIds.length > 0) {
        await tx.assessmentCriterion.deleteMany({
          where: { learningOutcomeId: { in: loIds } },
        });
      }

      // 3) Learning outcomes
      await tx.learningOutcome.deleteMany({
        where: { unitId: unit.id },
      });

      // 4) Assignment briefs — should be none due to guard
      // but keep a defensive detach+delete block in case old data exists
      if (briefIds.length > 0) {
        await tx.assignment.updateMany({
          where: { assignmentBriefId: { in: briefIds } },
          data: { assignmentBriefId: null },
        });

        await tx.assignmentCriterionMap.deleteMany({
          where: { assignmentBriefId: { in: briefIds } },
        });

        await tx.assignmentBrief.deleteMany({
          where: { id: { in: briefIds } },
        });
      }

      // 5) finally the unit
      await tx.unit.delete({ where: { id: unit.id } });
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("UNIT_DELETE_ERROR:", err);
    return NextResponse.json(
      { error: "UNIT_DELETE_ERROR", message: String(err?.message || err) },
      { status: 500 }
    );
  }
}
