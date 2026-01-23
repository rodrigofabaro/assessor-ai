import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    // If there are submissions pointing at this student, we block deletion.
    // This keeps audit trails intact and avoids referential chaos.
    const subCount = await prisma.submission.count({ where: { studentId: id } });
    if (subCount > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete this student because submissions exist for them. (Audit trails must remain intact.)",
        },
        { status: 409 }
      );
    }

    await prisma.student.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : String(e);
    return NextResponse.json({ error: msg || "Delete failed" }, { status: 500 });
  }
}
