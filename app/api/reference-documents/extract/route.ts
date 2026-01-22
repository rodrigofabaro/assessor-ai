import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

import { parseBriefText, parseSpecText, type ExtractDraft } from "@/lib/referenceParser";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const documentId = body?.documentId as string | undefined;

    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
    }

    const doc = await prisma.referenceDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Read file
    const storagePath = doc.storagePath;
    if (!storagePath || !fs.existsSync(storagePath)) {
      return NextResponse.json(
        { error: "Stored file not found on disk" },
        { status: 500 }
      );
    }

    const ext = path.extname(doc.originalFilename || storagePath).toLowerCase();
    if (ext !== ".pdf") {
      return NextResponse.json(
        {
          error:
            "Auto-extract currently supports PDF only. DOCX/scanned OCR will land in Phase 3.",
        },
        { status: 400 }
      );
    }

    const buf = fs.readFileSync(storagePath);

    // Dynamic import to avoid CJS/ESM default-export issues in Next build
    const mod = await import("pdf-parse");
    const pdfParse = (mod as any).default ?? (mod as any);
    const parsed = await pdfParse(buf);
    const text = parsed?.text || "";

    // 🔎 DEBUG: inspect how pdf-parse outputs the LO/AC table
    if (doc.type === "SPEC") {
      const anchor = "learning outcomes and assessment criteria";
      const lower = text.toLowerCase();
      const start = lower.indexOf(anchor);

      if (start === -1) {
        console.log("[SPEC DEBUG] Anchor NOT found");
        console.log("[SPEC DEBUG] First 1000 chars:\n", text.slice(0, 1000));
      } else {
        console.log(
          "[SPEC DEBUG] LO/AC table snippet:\n",
          text.slice(start, start + 2500)
        );
      }
    }

    let draft: ExtractDraft;

    if (doc.type === "SPEC") {
      draft = parseSpecText(text);
    } else if (doc.type === "BRIEF") {
      draft = parseBriefText(text);
    } else {
      return NextResponse.json(
        { error: "Auto-extract is supported for SPEC and BRIEF only." },
        { status: 400 }
      );
    }

    // Persist draft + status (Phase 2.2: inbox + review)
    const warnings = (draft as any)?.notes || [];
    const meta: any = {
      extractedAt: new Date().toISOString(),
      unitCode:
        (draft as any)?.unit?.unitCode || (draft as any)?.unitCodeGuess || null,
      assignmentCode: (draft as any)?.assignmentCode || null,
    };

    const updated = await prisma.referenceDocument.update({
      where: { id: doc.id },
      data: {
        status: "EXTRACTED" as any,
        extractedJson: draft as any,
        extractionWarnings: warnings as any,
        sourceMeta: meta as any,
      },
    });

    return NextResponse.json({ document: updated, draft, warnings, meta });
  } catch (err) {
    console.error("REFERENCE_EXTRACT_ERROR:", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}
