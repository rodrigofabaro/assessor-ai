import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/students/[id]
// Returns student + a small summary used by the profile page.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const student = await prisma.student.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        externalRef: true,
        courseName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const [totalSubmissions, last] = await Promise.all([
      prisma.submission.count({ where: { studentId: id } }),
      prisma.submission.findFirst({
        where: { studentId: id },
        orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
        select: {
          uploadedAt: true,
          assessments: { select: { overallGrade: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
    ]);

    // status breakdown
    const byStatusRows = await prisma.submission.groupBy({
      by: ["status"],
      where: { studentId: id },
      _count: { _all: true },
    });

    const byStatus: Record<string, number> = {};
    for (const r of byStatusRows) byStatus[r.status] = r._count._all;

    return NextResponse.json({
      student,
      summary: {
        totalSubmissions,
        lastSubmissionAt: last?.uploadedAt ? last.uploadedAt.toISOString() : null,
        lastOverallGrade: last?.assessments?.[0]?.overallGrade ?? null,
        byStatus,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load student" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    // Block deletion if linked submissions exist (audit safety)
    const cnt = await prisma.submission.count({ where: { studentId: id } });
    if (cnt > 0) {
      return NextResponse.json(
        { error: "Cannot delete student: submissions exist for this student." },
        { status: 409 }
      );
    }

    await prisma.student.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Delete failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const fullName =
      typeof body.fullName === "string" ? body.fullName.trim() : undefined;
    const email =
      typeof body.email === "string" ? body.email.trim() || null : undefined;
    const externalRef =
      typeof body.externalRef === "string"
        ? body.externalRef.trim() || null
        : undefined;
    const courseName =
      typeof body.courseName === "string"
        ? body.courseName.trim() || null
        : undefined;

    if (!fullName) {
      return NextResponse.json(
        { error: "fullName is required." },
        { status: 400 }
      );
    }

    const updated = await prisma.student.update({
      where: { id },
      data: {
        fullName,
        ...(email !== undefined ? { email } : {}),
        ...(externalRef !== undefined ? { externalRef } : {}),
        ...(courseName !== undefined ? { courseName } : {}),
      },
      select: { id: true, fullName: true, email: true, externalRef: true, courseName: true, createdAt: true },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Update failed" },
      { status: 500 }
    );
  }
}
