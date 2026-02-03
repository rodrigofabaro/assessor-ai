import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { resolveStoredFile } from "@/lib/extraction/storage/resolveStoredFile";
import { extractReferenceDocument } from "@/lib/extraction/index";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

function safeBool(x: unknown) {
  return x === true || x === "true" || x === 1 || x === "1";
}

function summarizeExtracted(extractedJson: any) {
  try {
    if (!extractedJson || typeof extractedJson !== "object") return null;

    const kind = extractedJson?.kind ?? null;
    const parserVersion = extractedJson?.parserVersion ?? null;
    const unitCode = extractedJson?.unit?.unitCode ?? null;
    const specIssue = extractedJson?.unit?.specIssue ?? null;

    let loCount: number | null = null;
    let criteriaCount: number | null = null;

    const los = extractedJson?.learningOutcomes;
    if (Array.isArray(los)) {
      loCount = los.length;
      let c = 0;
      for (const lo of los) {
        const arr = lo?.criteria;
        if (Array.isArray(arr)) c += arr.length;
      }
      criteriaCount = c;
    }

    const detected = extractedJson?.detectedCriterionCodes;
    const detectedCount = Array.isArray(detected) ? detected.length : null;

    return { kind, parserVersion, unitCode, specIssue, loCount, criteriaCount, detectedCount };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));

  const documentId = safeStr(body?.documentId || body?.id || body?.referenceDocumentId);
  const forceReextract = safeBool(body?.forceReextract || body?.forceReExtract || body?.force || body?.reextract);
  const reason = safeStr(body?.reason || body?.note || body?.message);

  if (!documentId) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_ID", message: "Missing reference document id." }, { status: 400 });
  }

  const doc = await prisma.referenceDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      type: true,
      status: true,
      title: true,
      version: true,
      storagePath: true,
      storedFilename: true,
      originalFilename: true,
      extractedJson: true,
      sourceMeta: true,
      lockedAt: true,
      lockedBy: true,
    },
  });

  if (!doc) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Reference document not found." }, { status: 404 });
  }

  // 🔒 Stability rule: locked docs are immutable unless forceReextract=true.
  if (doc.lockedAt && !forceReextract) {
    return NextResponse.json(
      {
        error: "REFERENCE_LOCKED",
        message: "Reference document is locked. Use forceReextract=true to overwrite (audit logged).",
      },
      { status: 423 }
    );
  }

  try {
    const resolved = await resolveStoredFile({
      storagePath: doc.storagePath,
      storedFilename: doc.storedFilename,
    });

    if (!resolved.ok || !resolved.path) {
      const msg =
        `File not found for reference document.\n` +
        `originalFilename: ${doc.originalFilename}\n` +
        `storedFilename: ${doc.storedFilename}\n` +
        `storagePath (DB): ${doc.storagePath}\n` +
        `Tried:\n- ${resolved.tried.join("\n- ")}\n`;

      await prisma.referenceDocument.update({
        where: { id: doc.id },
        data: { status: "FAILED", extractionWarnings: [msg] },
      });

      return NextResponse.json(
        {
          error: "REFERENCE_FILE_MISSING",
          message: "The stored file path is invalid or the file was moved/deleted.",
          detail: msg,
        },
        { status: 400 }
      );
    }

    const prevMeta = (doc.sourceMeta && typeof doc.sourceMeta === "object") ? (doc.sourceMeta as any) : {};
    const prevExtractSummary = summarizeExtracted(doc.extractedJson);

    const result = await extractReferenceDocument({
      type: doc.type,
      filePath: resolved.path,
      docTitleFallback: doc.title || doc.originalFilename || "",
    });

    const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
    const extractedJson = result?.extractedJson ?? null;

    const nextExtractSummary = summarizeExtracted(extractedJson);
    const nowIso = new Date().toISOString();

    // Only append history when we're explicitly overwriting a locked doc.
    const existingHistory: any[] = Array.isArray(prevMeta.reextractHistory) ? prevMeta.reextractHistory : [];
    const reextractHistory = forceReextract
      ? [...existingHistory, { at: nowIso, reason: reason || null, previous: prevExtractSummary, next: nextExtractSummary }].slice(-25)
      : existingHistory;

    const sourceMeta = {
      ...prevMeta,
      filePathUsed: resolved.path,
      originalFilename: doc.originalFilename,
      storedFilename: doc.storedFilename,
      unitCode: extractedJson?.unit?.unitCode || null,
      specIssue: extractedJson?.unit?.specIssue || null,
      parserVersion: extractedJson?.parserVersion || null,
      reextractHistory,
    } as any;

    await prisma.referenceDocument.update({
      where: { id: doc.id },
      data: {
        status: "EXTRACTED",
        extractedJson: extractedJson as any,
        extractionWarnings: warnings,
        sourceMeta,
      },
    });

    return NextResponse.json({ ok: true, id: doc.id, usedPath: resolved.path, warnings, extractedJson });
  } catch (err: any) {
    const message = err?.message || String(err);
    const stack = err?.stack ? String(err.stack) : "";

    await prisma.referenceDocument.update({
      where: { id: doc.id },
      data: {
        status: "FAILED",
        extractionWarnings: [`REFERENCE_EXTRACT_ERROR: ${message}`, stack ? stack.slice(0, 2000) : ""].filter(Boolean),
      },
    });

    return NextResponse.json({ error: "REFERENCE_EXTRACT_ERROR", message }, { status: 500 });
  }

const existing = await prisma.referenceDocument.findFirst({
  where: { type: type as any, checksumSha256 },
  select: { id: true, title: true, version: true, uploadedAt: true, status: true },
});

if (existing) {
  return NextResponse.json(
    {
      error: "DUPLICATE_UPLOAD",
      message: `This ${type} file was already uploaded (id: ${existing.id}, v${existing.version}, status: ${existing.status}).`,
      existing,
    },
    { status: 409 }
  );
}


}
