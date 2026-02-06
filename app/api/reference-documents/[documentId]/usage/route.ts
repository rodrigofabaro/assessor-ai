import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { documentId: string } }) {
  const documentId = params?.documentId;

  if (!documentId) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_ID", message: "Missing reference document id." }, { status: 400 });
  }

  const doc = await prisma.referenceDocument.findUnique({
    where: { id: documentId },
    select: { id: true, type: true, status: true, lockedAt: true },
  });

  if (!doc) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Reference document not found." }, { status: 404 });
  }

  if (doc.type !== "BRIEF") {
    return NextResponse.json({ error: "UNSUPPORTED_TYPE", message: "Only BRIEF documents are supported." }, { status: 400 });
  }

  const linkedBriefs = await prisma.assignmentBrief.findMany({
    where: { briefDocumentId: doc.id },
    select: { id: true },
  });
  const briefIds = linkedBriefs.map((b) => b.id);

  let submissionCount = 0;
  if (briefIds.length) {
    submissionCount = await prisma.submission.count({
      where: { assignment: { assignmentBriefId: { in: briefIds } } },
    });
  }

  const inUse = submissionCount > 0;
  const locked = !!doc.lockedAt || doc.status === "LOCKED";

  return NextResponse.json({
    documentId: doc.id,
    locked,
    inUse,
    submissionCount,
    linkedBriefCount: briefIds.length,
    canUnlock: locked && !inUse,
    canDelete: !locked && !inUse,
  });
}
