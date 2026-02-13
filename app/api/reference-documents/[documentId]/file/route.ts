import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveStoredFile } from "@/lib/extraction/storage/resolveStoredFile";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

function contentTypeFor(filename: string) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ documentId: string }> }
) {
  const params = await ctx.params;
  const documentId = safeStr(params?.documentId);
  if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });

  const doc = await prisma.referenceDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      originalFilename: true,
      storedFilename: true,
      storagePath: true,
      type: true,
    },
  });

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const resolved = await resolveStoredFile({
    storagePath: doc.storagePath,
    storedFilename: doc.storedFilename,
  });

  if (!resolved.ok || !resolved.path) {
    return NextResponse.json(
      { error: "FILE_NOT_FOUND", tried: resolved.tried, docId: doc.id },
      { status: 404 }
    );
  }

  const stat = fs.statSync(resolved.path);
  const filename = doc.originalFilename || doc.storedFilename || `document-${doc.id}.pdf`;

  const stream = fs.createReadStream(resolved.path);

  const contentType = contentTypeFor(filename);
  const disposition = contentType === "application/pdf" ? "inline" : "attachment";

  return new NextResponse(stream as any, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Content-Disposition": `${disposition}; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
