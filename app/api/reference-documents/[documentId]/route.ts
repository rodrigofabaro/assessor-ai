import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteStorageFile } from "@/lib/storage/provider";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isOrgScopeCompatError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "").trim().toUpperCase();
  const msg = String((error as { message?: string } | null)?.message || error || "").toLowerCase();
  if (code === "P2022") return true;
  if (msg.includes("organizationid") && msg.includes("does not exist")) return true;
  if (msg.includes("unknown argument") && msg.includes("organizationid")) return true;
  return false;
}

export async function GET(_req: Request, { params }: { params: { documentId: string } }) {
  const documentId = params?.documentId;
  if (!documentId) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_ID", message: "Missing reference document id." }, { status: 400 });
  }

  const organizationId = await getRequestOrganizationId();
  const scopedWhere = addOrganizationReadScope({ id: documentId }, organizationId);

  let doc:
    | {
        id: string;
        type: string;
        status: string;
        title: string;
        version: number;
        originalFilename: string;
        storedFilename: string | null;
        storagePath: string;
        checksumSha256: string;
        uploadedAt: Date;
        updatedAt: Date;
        lockedAt: Date | null;
        sourceMeta: unknown;
        extractionWarnings: unknown;
        extractedJson: unknown;
      }
    | null = null;

  const select = {
    id: true,
    type: true,
    status: true,
    title: true,
    version: true,
    originalFilename: true,
    storedFilename: true,
    storagePath: true,
    checksumSha256: true,
    uploadedAt: true,
    updatedAt: true,
    lockedAt: true,
    sourceMeta: true,
    extractionWarnings: true,
    extractedJson: true,
  } as const;

  try {
    doc = await prisma.referenceDocument.findFirst({
      where: scopedWhere as any,
      select,
    });
  } catch (error) {
    if (!organizationId || !isOrgScopeCompatError(error)) throw error;
    doc = await prisma.referenceDocument.findUnique({
      where: { id: documentId },
      select,
    });
  }

  if (!doc) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Reference document not found." }, { status: 404 });
  }

  return NextResponse.json({
    document: {
      ...doc,
      uploadedAt: doc.uploadedAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      lockedAt: doc.lockedAt ? doc.lockedAt.toISOString() : null,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: { documentId: string } }) {
  const documentId = params?.documentId;

  if (!documentId) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_ID", message: "Missing reference document id." }, { status: 400 });
  }

  const organizationId = await getRequestOrganizationId();
  const scopedWhere = addOrganizationReadScope({ id: documentId }, organizationId);

  let doc = null as
    | {
        id: string;
        type: string;
        lockedAt: Date | null;
        status: string;
        storagePath: string;
        originalFilename: string;
      }
    | null;

  try {
    doc = await prisma.referenceDocument.findFirst({
      where: scopedWhere as any,
      select: {
        id: true,
        type: true,
        lockedAt: true,
        status: true,
        storagePath: true,
        originalFilename: true,
      },
    });
  } catch (error) {
    if (!organizationId || !isOrgScopeCompatError(error)) throw error;
    doc = await prisma.referenceDocument.findUnique({
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
  }

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
      await deleteStorageFile(doc.storagePath);
    } catch (err) {
      console.warn("REFERENCE_DELETE_FILE_FAILED", doc.storagePath, doc.originalFilename, err);
    }
  }

  return NextResponse.json({ ok: true });
}
