import fs from "fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";
import { pdfToText } from "@/lib/extraction/text/pdfToText";
import { debugBriefExtraction } from "@/lib/extractors/brief";
import { resolveStorageAbsolutePathAsync } from "@/lib/storage/provider";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const documentId = String(body?.documentId || "").trim();
    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
    }

    const organizationId = await getRequestOrganizationId();
    const doc = await prisma.referenceDocument.findFirst({
      where: addOrganizationReadScope({ id: documentId }, organizationId) as any,
    });
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.type !== "BRIEF") {
      return NextResponse.json({ error: "Debug extract is only supported for BRIEF documents." }, { status: 400 });
    }

    const filePath = await resolveStorageAbsolutePathAsync(doc.storagePath);
    if (!filePath) {
      return NextResponse.json({ error: "Document file path could not be resolved." }, { status: 404 });
    }
    const buf = await fs.readFile(filePath);
    const { text, pageCount } = await pdfToText(buf);

    const debug = debugBriefExtraction(text);
    return NextResponse.json({ documentId, pageCount, debug });
  } catch (err) {
    console.error("DEBUG_EXTRACT_ERROR:", err);
    return NextResponse.json({ error: "Debug extract failed" }, { status: 500 });
  }
}
