import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Phase 2.5 — Assignment ↔ Reference Binding
 *
 * We intentionally do NOT extract questions/tasks from briefs.
 * This endpoint only binds an operational Assignment to a LOCKED AssignmentBrief,
 * which implies the linked Unit + SPEC document via the brief's unit.
 */

export async function GET() {
  const assignments = await prisma.assignment.findMany({
    orderBy: [{ unitCode: "asc" }, { assignmentRef: "asc" }],
    include: {
      assignmentBrief: {
        include: {
          unit: {
            include: {
              specDocument: true,
            },
          },
          briefDocument: true,
        },
      },
    },
  });

  return NextResponse.json({ assignments });
}

type PostBody = {
  assignmentId?: string;
  assignmentBriefId?: string | null;
  lockedBy?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PostBody;

    const assignmentId = String(body.assignmentId || "").trim();
    const assignmentBriefIdRaw = body.assignmentBriefId;
    const assignmentBriefId =
      assignmentBriefIdRaw === null || assignmentBriefIdRaw === undefined
        ? null
        : String(assignmentBriefIdRaw).trim();

    const lockedBy = body.lockedBy ? String(body.lockedBy).trim() : null;

    if (!assignmentId) {
      return NextResponse.json({ error: "Missing assignmentId" }, { status: 400 });
    }

    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });

    // If already locked, do not allow changes (audit/provenance)
    if (assignment.bindingStatus === "LOCKED") {
      return NextResponse.json(
        { error: "Binding is LOCKED and cannot be modified." },
        { status: 409 }
      );
    }

    if (assignmentBriefId) {
      const brief = await prisma.assignmentBrief.findUnique({
        where: { id: assignmentBriefId },
        include: { unit: { include: { specDocument: true } } },
      });
      if (!brief) return NextResponse.json({ error: "Assignment brief not found" }, { status: 404 });

      if (brief.status !== "LOCKED") {
        return NextResponse.json(
          { error: "Assignment brief must be LOCKED before binding." },
          { status: 409 }
        );
      }

      if (!brief.unit || brief.unit.status !== "LOCKED") {
        return NextResponse.json(
          { error: "The linked Unit (from SPEC) must be LOCKED before binding." },
          { status: 409 }
        );
      }

      if (!brief.unit.specDocumentId) {
        return NextResponse.json(
          { error: "The linked Unit has no SPEC document attached." },
          { status: 409 }
        );
      }

      // Enforce unitCode match to avoid cross-wiring
      if (assignment.unitCode.trim() !== brief.unit.unitCode.trim()) {
        return NextResponse.json(
          {
            error: `Unit mismatch: assignment.unitCode=${assignment.unitCode} but brief.unitCode=${brief.unit.unitCode}`,
          },
          { status: 409 }
        );
      }
    }

    // Lock or clear binding
    const nextStatus = assignmentBriefId ? "LOCKED" : "DRAFT";

    const updated = await prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        assignmentBriefId,
        bindingStatus: nextStatus as any,
        bindingLockedAt: assignmentBriefId ? new Date() : null,
        bindingLockedBy: assignmentBriefId ? lockedBy : null,
      },
      include: {
        assignmentBrief: {
          include: {
            unit: { include: { specDocument: true } },
            briefDocument: true,
          },
        },
      },
    });

    return NextResponse.json({ assignment: updated });
  } catch (err) {
    console.error("ASSIGNMENT_BINDING_ERROR:", err);
    return NextResponse.json({ error: "Binding failed" }, { status: 500 });
  }
}
