import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

type IvOutcome = "APPROVED" | "CHANGES_REQUIRED" | "REJECTED";

function asObject(x: unknown): Record<string, any> {
  if (x && typeof x === "object" && !Array.isArray(x)) return x as Record<string, any>;
  return {};
}

function safeIvRecords(x: unknown) {
  const arr = Array.isArray(x) ? x : [];
  return arr
    .filter(Boolean)
    .map((r: any) => ({
      id: String(r.id || ""),
      academicYear: String(r.academicYear || ""),
      verifierName: r.verifierName ?? null,
      verificationDate: r.verificationDate ?? null,
      outcome: (String(r.outcome || "CHANGES_REQUIRED").toUpperCase() as IvOutcome) || "CHANGES_REQUIRED",
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

function getIvRecordsFromMeta(meta: unknown) {
  const obj = asObject(meta);
  return obj.ivRecords;
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

export async function GET(_req: Request, { params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = await params;
  const { doc, error } = await loadBriefDoc(briefId);
  if (error) return error;

  const records = safeIvRecords(getIvRecordsFromMeta(doc?.sourceMeta));
  return NextResponse.json({ records });
}

export async function POST(req: Request, { params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = await params;
  const { doc, error } = await loadBriefDoc(briefId);
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const academicYear = String((body as any).academicYear || "").trim();
  const outcomeRaw = String((body as any).outcome || "CHANGES_REQUIRED").toUpperCase();
  const outcome: IvOutcome = outcomeRaw === "APPROVED" || outcomeRaw === "REJECTED" ? (outcomeRaw as IvOutcome) : "CHANGES_REQUIRED";

  if (!academicYear) {
    return NextResponse.json({ error: "Academic year is required" }, { status: 400 });
  }

  const record = {
    id: crypto.randomUUID(),
    academicYear,
    verifierName: (body as any).verifierName ? String((body as any).verifierName).trim() : null,
    verificationDate: (body as any).verificationDate ? String((body as any).verificationDate).trim() : null,
    outcome,
    notes: (body as any).notes ? String((body as any).notes).trim() : null,
    createdAt: new Date().toISOString(),
  };

  const prev = asObject(doc.sourceMeta);
  const existing = safeIvRecords(prev.ivRecords);
  const nextRecords = [record, ...existing];
  const nextMeta = { ...prev, ivRecords: nextRecords };

  await prisma.referenceDocument.update({
    where: { id: doc.id },
    data: { sourceMeta: nextMeta as any },
  });

  return NextResponse.json({ records: nextRecords });
}
