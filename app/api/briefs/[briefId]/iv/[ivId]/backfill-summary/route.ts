import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { resolveStoredFile } from "@/lib/extraction/storage/resolveStoredFile";
import { extractIvSummaryFromDocxBuffer } from "@/lib/iv/evidenceSummary";

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
            summary: r.attachment.summary && typeof r.attachment.summary === "object" ? r.attachment.summary : null,
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

export async function POST(_req: Request, { params }: { params: Promise<{ briefId: string; ivId: string }> }) {
  const { briefId, ivId } = await params;
  const { doc, error } = await loadBriefDoc(briefId);
  if (error) return error;

  const prev = asObject(doc.sourceMeta);
  const existing = safeIvRecords(prev.ivRecords);
  const idx = existing.findIndex((r) => r.id === ivId);
  if (idx === -1) return NextResponse.json({ error: "IV record not found" }, { status: 404 });
  const attachment = existing[idx].attachment;
  if (!attachment?.documentId) {
    return NextResponse.json({ error: "IV record has no attachment." }, { status: 400 });
  }

  const attachedDoc = await prisma.referenceDocument.findUnique({
    where: { id: attachment.documentId },
    select: { id: true, originalFilename: true, storedFilename: true, storagePath: true },
  });
  if (!attachedDoc) {
    return NextResponse.json({ error: "Attached evidence document not found." }, { status: 404 });
  }

  const ext = path.extname(String(attachedDoc.originalFilename || attachedDoc.storedFilename || "")).toLowerCase();
  if (ext !== ".docx") {
    return NextResponse.json({ error: "Backfill summary currently supports DOCX evidence only." }, { status: 400 });
  }

  const resolved = await resolveStoredFile({
    storagePath: attachedDoc.storagePath,
    storedFilename: attachedDoc.storedFilename,
  });
  if (!resolved.ok || !resolved.path) {
    return NextResponse.json({ error: "Attached evidence file not found on disk." }, { status: 404 });
  }

  const buffer = fs.readFileSync(resolved.path);
  const summary = await extractIvSummaryFromDocxBuffer(buffer);
  if (!summary) {
    return NextResponse.json({ error: "Could not extract summary from DOCX." }, { status: 422 });
  }

  const nextRecords = [...existing];
  nextRecords[idx] = {
    ...nextRecords[idx],
    attachment: {
      ...nextRecords[idx].attachment,
      summary,
    },
  };
  const nextMeta = { ...prev, ivRecords: nextRecords };
  await prisma.referenceDocument.update({
    where: { id: doc.id },
    data: { sourceMeta: nextMeta as any },
  });

  return NextResponse.json({ records: nextRecords });
}

