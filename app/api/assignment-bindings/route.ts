import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type BindingStatus = "DRAFT" | "LOCKED";

function asBindingStatus(value: string | null | undefined): BindingStatus {
  return String(value || "").toUpperCase() === "LOCKED" ? "LOCKED" : "DRAFT";
}

function normalizeActor(raw: unknown) {
  const actor = String(raw || "").trim();
  return actor || "admin";
}

export async function GET() {
  const assignments = await prisma.assignment.findMany({
    orderBy: [{ unitCode: "asc" }, { assignmentRef: "asc" }, { title: "asc" }],
    include: {
      assignmentBrief: {
        include: {
          unit: {
            include: { specDocument: true },
          },
          briefDocument: true,
        },
      },
    },
  });

  const normalized = assignments.map((a) => ({
    ...a,
    bindingStatus: asBindingStatus(a.bindingStatus),
  }));

  return NextResponse.json({ assignments: normalized });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const assignmentId = String(body?.assignmentId || "").trim();
    const assignmentBriefIdRaw = body?.assignmentBriefId;
    const assignmentBriefId =
      typeof assignmentBriefIdRaw === "string" && assignmentBriefIdRaw.trim() ? assignmentBriefIdRaw.trim() : null;
    const lockedBy = normalizeActor(body?.lockedBy);

    if (!assignmentId) {
      return NextResponse.json({ error: "assignmentId is required." }, { status: 400 });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, unitCode: true, bindingStatus: true },
    });
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    if (asBindingStatus(assignment.bindingStatus) === "LOCKED") {
      return NextResponse.json({ error: "Binding is already locked for this assignment." }, { status: 409 });
    }

    if (!assignmentBriefId) {
      const cleared = await prisma.assignment.update({
        where: { id: assignmentId },
        data: {
          assignmentBriefId: null,
          bindingStatus: "DRAFT",
          bindingLockedAt: null,
          bindingLockedBy: null,
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

      return NextResponse.json({
        assignment: {
          ...cleared,
          bindingStatus: asBindingStatus(cleared.bindingStatus),
        },
      });
    }

    const brief = await prisma.assignmentBrief.findUnique({
      where: { id: assignmentBriefId },
      include: {
        unit: true,
      },
    });
    if (!brief) {
      return NextResponse.json({ error: "Assignment brief not found." }, { status: 404 });
    }

    // Guardrail: only lock against brief from same unit code.
    if (String(brief.unit.unitCode || "") !== String(assignment.unitCode || "")) {
      return NextResponse.json(
        {
          error: `Unit mismatch: assignment ${assignment.unitCode} cannot bind to brief unit ${brief.unit.unitCode}.`,
        },
        { status: 422 }
      );
    }

    // Guardrail: binding must target LOCKED brief + LOCKED unit.
    const briefLocked = !!brief.lockedAt || brief.status === "LOCKED";
    const unitLocked = !!brief.unit.lockedAt || brief.unit.status === "LOCKED";

    if (!briefLocked || !unitLocked) {
      return NextResponse.json(
        {
          error: "Only LOCKED brief + LOCKED unit can be bound.",
          details: {
            briefLocked,
            unitLocked,
          },
        },
        { status: 422 }
      );
    }

    const updated = await prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        assignmentBriefId: brief.id,
        bindingStatus: "LOCKED",
        bindingLockedAt: new Date(),
        bindingLockedBy: lockedBy,
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

    return NextResponse.json({
      assignment: {
        ...updated,
        bindingStatus: asBindingStatus(updated.bindingStatus),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to save binding." }, { status: 500 });
  }
}

