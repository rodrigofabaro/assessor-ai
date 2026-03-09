import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSupportedDeletionType(type: string) {
  return type === "BRIEF" || type === "SPEC";
}

export async function GET(_req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const organizationId = await getRequestOrganizationId();

  if (!documentId) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_ID", message: "Missing reference document id." }, { status: 400 });
  }

  const doc = await prisma.referenceDocument.findFirst({
    where: addOrganizationReadScope({ id: documentId }, organizationId) as any,
    select: { id: true, type: true, status: true, lockedAt: true },
  });

  if (!doc) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Reference document not found." }, { status: 404 });
  }

  if (!isSupportedDeletionType(String(doc.type || ""))) {
    return NextResponse.json(
      { error: "UNSUPPORTED_TYPE", message: "Only SPEC and BRIEF documents are supported." },
      { status: 400 }
    );
  }

  let linkedBriefCount = 0;
  let linkedUnitCount = 0;
  let submissionCount = 0;

  if (doc.type === "BRIEF") {
    const linkedBriefs = await prisma.assignmentBrief.findMany({
      where: { briefDocumentId: doc.id },
      select: { id: true },
    });
    const briefIds = linkedBriefs.map((b) => b.id);
    linkedBriefCount = briefIds.length;
    if (briefIds.length) {
      submissionCount = await prisma.submission.count({
        where: { assignment: { assignmentBriefId: { in: briefIds } } },
      });
    }
  } else if (doc.type === "SPEC") {
    const linkedUnits = await prisma.unit.findMany({
      where: addOrganizationReadScope({ specDocumentId: doc.id }, organizationId) as any,
      select: { id: true, unitCode: true },
    });
    const unitCodes = linkedUnits.map((unit) => String(unit.unitCode || "").trim()).filter(Boolean);
    linkedUnitCount = linkedUnits.length;
    if (unitCodes.length) {
      submissionCount = await prisma.submission.count({
        where: addOrganizationReadScope({ assignment: { unitCode: { in: unitCodes } } }, organizationId) as any,
      });
    }
  }

  const inUse = submissionCount > 0;
  const locked = !!doc.lockedAt || doc.status === "LOCKED";

  return NextResponse.json({
    documentId: doc.id,
    locked,
    inUse,
    submissionCount,
    linkedBriefCount,
    linkedUnitCount,
    canUnlock: doc.type === "BRIEF" && locked && !inUse,
    canDelete: !locked && !inUse,
  });
}
