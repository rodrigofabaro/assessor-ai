import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { extractIvSummaryFromDocxBuffer } from "@/lib/iv/evidenceSummary";

function asObject(x: any) {
  if (x && typeof x === "object" && !Array.isArray(x)) return x;
  return {};
}

function safeName(name: string) {
  return (name || "upload")
    .replace(/\s+/g, " ")
    .replace(/[^\w.\- ()]/g, "")
    .trim()
    .slice(0, 120);
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

export async function POST(req: Request, { params }: { params: Promise<{ briefId: string; ivId: string }> }) {
  const { briefId, ivId } = await params;
  const { brief, doc, error } = await loadBriefDoc(briefId);
  if (error) return error;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const filename = file.name || "iv-form";
  const ext = path.extname(filename).toLowerCase();
  const isPdf = file.type === "application/pdf" || ext === ".pdf";
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === ".docx";
  const isDoc = file.type === "application/msword" || ext === ".doc";
  if (!isPdf && !isDocx && !isDoc) {
    return NextResponse.json({ error: "Only PDF, DOCX, or DOC files are supported." }, { status: 400 });
  }

  const MAX_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 50MB)." }, { status: 413 });
  }

  const prev = asObject(doc.sourceMeta);
  const existing = safeIvRecords(prev.ivRecords);
  const idx = existing.findIndex((r) => r.id === ivId);
  if (idx === -1) {
    return NextResponse.json({ error: "IV record not found" }, { status: 404 });
  }
  if (existing[idx].attachment?.documentId) {
    return NextResponse.json(
      { error: "IV record already has an attachment. Create a new IV record to add a revised form." },
      { status: 409 }
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const checksumSha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  const uploadDirRel = "reference_uploads";
  const uploadDirAbs = path.join(process.cwd(), uploadDirRel);
  if (!fs.existsSync(uploadDirAbs)) fs.mkdirSync(uploadDirAbs, { recursive: true });

  const storedFilename = `${uuid()}-${safeName(filename)}`;
  const storagePathRel = path.join(uploadDirRel, storedFilename);
  const storagePathAbs = path.join(process.cwd(), storagePathRel);
  fs.writeFileSync(storagePathAbs, buffer);

  const ivDoc = await prisma.referenceDocument.create({
    data: {
      type: "IV_FORM",
      status: "UPLOADED",
      title: `IV Form ${existing[idx].academicYear} - ${brief.title || brief.assignmentCode || "Brief"}`,
      version: 1,
      originalFilename: filename,
      storedFilename,
      storagePath: storagePathRel,
      checksumSha256,
    },
  });

  const summary = isDocx ? await extractIvSummaryFromDocxBuffer(buffer) : null;
  const attachment = {
    documentId: ivDoc.id,
    originalFilename: ivDoc.originalFilename,
    uploadedAt: ivDoc.uploadedAt.toISOString(),
    size: file.size,
    storagePath: ivDoc.storagePath,
    summary,
  };

  const nextRecords = [...existing];
  nextRecords[idx] = { ...nextRecords[idx], attachment };
  const nextMeta = { ...prev, ivRecords: nextRecords };

  await prisma.referenceDocument.update({
    where: { id: doc.id },
    data: { sourceMeta: nextMeta as any },
  });

  return NextResponse.json({ records: nextRecords });
}
