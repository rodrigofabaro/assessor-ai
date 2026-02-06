import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function asObject(x: any) {
  if (x && typeof x === "object" && !Array.isArray(x)) return x;
  return {};
}

function safeIvRecords(x: any) {
  const arr = Array.isArray(x) ? x : [];
  return arr
    .filter(Boolean)
    .map((r: any) => ({
      id: String(r.id || ""),
      academicYear: String(r.academicYear || ""),
      verifierName: r.verifierName ?? null,
      verificationDate: r.verificationDate ?? null,
      outcome: String(r.outcome || "CHANGES_REQUIRED"),
      notes: r.notes ?? null,
      createdAt: String(r.createdAt || ""),
      attachment: r.attachment
        ? {
            documentId: String(r.attachment.documentId || ""),
            originalFilename: String(r.attachment.originalFilename || ""),
            uploadedAt: String(r.attachment.uploadedAt || ""),
            size: Number(r.attachment.size || 0),
            storagePath: r.attachment.storagePath ? String(r.attachment.storagePath) : null,
          }
        : null,
    }))
    .filter((r) => r.id && r.academicYear);
}

async function loadBriefDoc(briefId: string) {
  const brief = await prisma.assignmentBrief.findUnique({
    where: { id: briefId },
    include: { briefDocument: true },
  });
  if (!brief) return { error: NextResponse.json({ error: "Brief not found" }, { status: 404 }) };
  if (!brief.briefDocumentId || !brief.briefDocument) {
    return { error: NextResponse.json({ error: "Brief has no linked document" }, { status: 400 }) };
  }
  return { brief, doc: brief.briefDocument };
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ briefId: string; ivId: string }> }) {
  const { briefId, ivId } = await params;
  const { doc, error } = await loadBriefDoc(briefId);
  if (error) return error;

  const prev = asObject(doc.sourceMeta);
  const existing = safeIvRecords(prev.ivRecords);
  const nextRecords = existing.filter((r) => r.id !== ivId);
  const nextMeta = { ...prev, ivRecords: nextRecords };

  await prisma.referenceDocument.update({
    where: { id: doc.id },
    data: { sourceMeta: nextMeta as any },
  });

  return NextResponse.json({ records: nextRecords });
}
