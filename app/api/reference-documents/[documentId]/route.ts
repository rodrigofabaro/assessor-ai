import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { documentId: string } }) {
  const documentId = params?.documentId;

  if (!documentId) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_ID", message: "Missing reference document id." }, { status: 400 });
  }

  const doc = await prisma.referenceDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      type: true,
      lockedAt: true,
      status: true,
      storagePath: true,
      originalFilename: true,
    },
  });

  if (!doc) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Reference document not found." }, { status: 404 });
  }

  if (doc.type !== "BRIEF") {
    return NextResponse.json({ error: "UNSUPPORTED_TYPE", message: "Only BRIEF documents can be deleted." }, { status: 400 });
  }

  if (doc.lockedAt || doc.status === "LOCKED") {
    return NextResponse.json({ error: "BRIEF_LOCKED", message: "Locked briefs cannot be deleted." }, { status: 409 });
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

  if (submissionCount > 0) {
    return NextResponse.json(
      {
        error: "BRIEF_IN_USE",
        message: `Cannot delete: ${submissionCount} submission(s) linked to this brief.`,
        submissionCount,
      },
      { status: 409 }
    );
  }

  if (briefIds.length) {
    await prisma.assignmentBrief.updateMany({
      where: { id: { in: briefIds } },
      data: { briefDocumentId: null },
    });
  }

  await prisma.referenceDocument.delete({ where: { id: doc.id } });

  if (doc.storagePath) {
    try {
      const absPath = path.join(process.cwd(), doc.storagePath);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch (err) {
      console.warn("REFERENCE_DELETE_FILE_FAILED", doc.storagePath, doc.originalFilename, err);
    }
  }

  return NextResponse.json({ ok: true });
}
