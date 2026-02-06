import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const documentId = safeStr(body?.documentId || body?.id || body?.referenceDocumentId);

  if (!documentId) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_ID", message: "Missing reference document id." }, { status: 400 });
  }

  const doc = await prisma.referenceDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      type: true,
      status: true,
      lockedAt: true,
      lockedBy: true,
      extractedJson: true,
    },
  });

  if (!doc) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Reference document not found." }, { status: 404 });
  }

  if (doc.type !== "BRIEF") {
    return NextResponse.json({ error: "UNSUPPORTED_TYPE", message: "Only BRIEF documents can be unlocked." }, { status: 400 });
  }

  if (!doc.lockedAt && doc.status !== "LOCKED") {
    return NextResponse.json({ error: "NOT_LOCKED", message: "Brief is not locked." }, { status: 409 });
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
        message: `Cannot unlock: ${submissionCount} submission(s) linked to this brief.`,
        submissionCount,
      },
      { status: 409 }
    );
  }

  const nextStatus = doc.extractedJson ? "EXTRACTED" : "UPLOADED";

  const updated = await prisma.referenceDocument.update({
    where: { id: doc.id },
    data: {
      status: nextStatus as any,
      lockedAt: null,
      lockedBy: null,
    },
  });

  return NextResponse.json({ ok: true, document: updated });
}
