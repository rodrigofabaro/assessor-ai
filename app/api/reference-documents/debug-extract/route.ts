import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pdfToText } from "@/lib/extraction/text/pdfToText";
import { debugBriefExtraction } from "@/lib/extractors/brief";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const documentId = String(body?.documentId || "").trim();
    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
    }

    const doc = await prisma.referenceDocument.findUnique({ where: { id: documentId } });
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.type !== "BRIEF") {
      return NextResponse.json({ error: "Debug extract is only supported for BRIEF documents." }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), doc.storagePath);
    const buf = await fs.readFile(filePath);
    const { text, pageCount } = await pdfToText(buf);

    const debug = debugBriefExtraction(text);
    return NextResponse.json({ documentId, pageCount, debug });
  } catch (err) {
    console.error("DEBUG_EXTRACT_ERROR:", err);
    return NextResponse.json({ error: "Debug extract failed" }, { status: 500 });
  }
}
