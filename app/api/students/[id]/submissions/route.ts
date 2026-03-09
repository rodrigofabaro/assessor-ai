import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const organizationId = await getRequestOrganizationId();
  const student = await prisma.student.findFirst({
    where: addOrganizationReadScope({ id }, organizationId) as any,
    select: { id: true, organizationId: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const assignmentId = searchParams.get("assignmentId") || undefined;
  const status = searchParams.get("status") || undefined;
  const take = Math.min(parseInt(searchParams.get("take") || "50", 10) || 50, 200);
  const cursor = searchParams.get("cursor") || undefined;

  const where: any = {
    studentId: id,
    ...(assignmentId ? { assignmentId } : {}),
    ...(status ? { status } : {}),
  };
  const scopedOrgId = String(student.organizationId || organizationId || "").trim() || null;

  const rows = await prisma.submission.findMany({
    where: addOrganizationReadScope(where, scopedOrgId) as any,
    orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      uploadedAt: true,
      assignmentId: true,
      status: true,

      // If you have an Assignment relation with "title"
      assignment: { select: { title: true } },

      // If grades live in assessments (common in your design),
      // grab the most recent one and map it to overallGrade.
      assessments: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
        select: { overallGrade: true },
      },
    },
  });

  const hasMore = rows.length > take;
  const sliced = hasMore ? rows.slice(0, take) : rows;

  return NextResponse.json({
    items: sliced.map((s) => ({
      id: s.id,
      uploadedAt: s.uploadedAt,
      assignmentId: s.assignmentId ?? null,
      assignmentTitle: (s as any).assignment?.title ?? null,
      status: s.status,
      overallGrade: (s as any).assessments?.[0]?.overallGrade ?? null,
    })),
    nextCursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
  });
}
