import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Phase 2.5 Assignment ↔ Brief binding endpoint
 * - GET: list assignments with their current binding
 * - POST: bind an assignment to a brief (or clear)
 *
 * Lock rule (no extra columns needed):
 * - If the currently-bound brief is LOCKED, we treat the binding as LOCKED and refuse changes.
 */

export async function GET() {
  const assignments = await prisma.assignment.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: {
      assignmentBrief: {
        include: { unit: true },
      },
    },
  });

  return NextResponse.json({ assignments });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const assignmentId = String(body?.assignmentId || "").trim();
    const assignmentBriefIdRaw = body?.assignmentBriefId;
    const assignmentBriefId =
      assignmentBriefIdRaw === null || assignmentBriefIdRaw === undefined
        ? null
        : String(assignmentBriefIdRaw).trim();

    if (!assignmentId) {
      return NextResponse.json({ error: "Missing assignmentId" }, { status: 400 });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { assignmentBrief: true },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // If already locked, do not allow changes (audit/provenance)
    if (assignment.assignmentBrief?.status === "LOCKED") {
      return NextResponse.json(
        { error: "Binding is LOCKED (brief is locked) and cannot be modified." },
        { status: 409 }
      );
    }

    // If binding to a brief, ensure it exists
    if (assignmentBriefId) {
      const brief = await prisma.assignmentBrief.findUnique({
        where: { id: assignmentBriefId },
      });
      if (!brief) {
        return NextResponse.json({ error: "AssignmentBrief not found" }, { status: 404 });
      }
    }

    const updated = await prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        assignmentBriefId: assignmentBriefId || null,
      },
      include: {
        assignmentBrief: {
          include: { unit: true },
        },
      },
    });

    return NextResponse.json({ assignment: updated });
  } catch (err) {
    console.error("ASSIGNMENT_BINDING_ERROR:", err);
    return NextResponse.json({ error: "Binding failed" }, { status: 500 });
  }
}
