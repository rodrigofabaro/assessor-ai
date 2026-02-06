import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import fs from "fs";
import path from "path";

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
  const meta = asObject(doc.sourceMeta);
  return NextResponse.json({ attachment: meta.rubricAttachment ?? null });
}

export async function POST(req: Request, { params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = await params;
  const { brief, doc, error } = await loadBriefDoc(briefId);
  if (error) return error;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const filename = file.name || "rubric";
  const ext = path.extname(filename).toLowerCase();
  const isPdf = file.type === "application/pdf" || ext === ".pdf";
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === ".docx";
  if (!isPdf && !isDocx) {
    return NextResponse.json({ error: "Only PDF or DOCX files are supported." }, { status: 400 });
  }

  const MAX_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 50MB)." }, { status: 413 });
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

  const rubricDoc = await prisma.referenceDocument.create({
    data: {
      type: "RUBRIC",
      status: "UPLOADED",
      title: `Rubric for ${brief.assignmentCode}`,
      version: 1,
      originalFilename: filename,
      storedFilename,
      storagePath: storagePathRel,
      checksumSha256,
    },
  });

  const attachment = {
    documentId: rubricDoc.id,
    originalFilename: rubricDoc.originalFilename,
    uploadedAt: rubricDoc.uploadedAt.toISOString(),
  };

  const prev = asObject(doc.sourceMeta);
  const nextMeta = { ...prev, rubricAttachment: attachment };
  await prisma.referenceDocument.update({
    where: { id: doc.id },
    data: { sourceMeta: nextMeta as any },
  });

  return NextResponse.json({ attachment });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = await params;
  const { doc, error } = await loadBriefDoc(briefId);
  if (error) return error;
  const prev = asObject(doc.sourceMeta);
  const nextMeta = { ...prev };
  delete nextMeta.rubricAttachment;
  await prisma.referenceDocument.update({
    where: { id: doc.id },
    data: { sourceMeta: nextMeta as any },
  });
  return NextResponse.json({ attachment: null });
}
