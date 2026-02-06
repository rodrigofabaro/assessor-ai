import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { documentId: string } };

export async function POST(_req: Request, { params }: Ctx) {
  const { documentId } = params;
  if (!documentId) {
    return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
  }

  const doc = await prisma.referenceDocument.findUnique({
    where: { id: documentId },
    select: { id: true, sourceMeta: true },
  });

  if (!doc) {
    return NextResponse.json({ error: "Reference document not found" }, { status: 404 });
  }

  const prev = (doc.sourceMeta && typeof doc.sourceMeta === "object" ? doc.sourceMeta : {}) as Record<string, any>;
  const updated = await prisma.referenceDocument.update({
    where: { id: documentId },
    data: {
      sourceMeta: {
        ...prev,
        archived: true,
        archivedAt: new Date().toISOString(),
      },
    },
  });

  return NextResponse.json({ ok: true, document: updated });
}
