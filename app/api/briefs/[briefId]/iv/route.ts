import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

type IvOutcome = "APPROVED" | "CHANGES_REQUIRED" | "REJECTED";

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
      outcome: (r.outcome || "CHANGES_REQUIRED") as IvOutcome,
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

export async function GET(_req: Request, { params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = await params;
  const { doc, error } = await loadBriefDoc(briefId);
  if (error) return error;
  const records = safeIvRecords(doc?.sourceMeta?.ivRecords);
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

  const academicYear = String(body.academicYear || "").trim();
  const outcome = String(body.outcome || "CHANGES_REQUIRED").toUpperCase() as IvOutcome;
  if (!academicYear) {
    return NextResponse.json({ error: "Academic year is required" }, { status: 400 });
  }

  const record = {
    id: crypto.randomUUID(),
    academicYear,
    verifierName: body.verifierName ? String(body.verifierName).trim() : null,
    verificationDate: body.verificationDate ? String(body.verificationDate).trim() : null,
    outcome: outcome === "APPROVED" || outcome === "REJECTED" ? outcome : "CHANGES_REQUIRED",
    notes: body.notes ? String(body.notes).trim() : null,
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
