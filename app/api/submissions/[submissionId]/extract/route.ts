import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractFile } from "@/lib/extraction";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await params;

  const id = String(submissionId || "");
  if (!id) {
    return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
  }

  const submission = await prisma.submission.findUnique({
    where: { id },
  });
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Create a run record so we always have an audit trail.
  const run = await prisma.submissionExtractionRun.create({
    data: {
      submissionId: id,
      status: "RUNNING",
      engineVersion: "extract-v1",
    },
  });

  await prisma.submission.update({
    where: { id },
    data: { status: "EXTRACTING" },
  });

  try {
    const res = await extractFile(submission.storagePath, submission.filename);

    // Persist pages
    await prisma.extractedPage.createMany({
      data: res.pages.map((p) => ({
        extractionRunId: run.id,
        pageNumber: p.pageNumber,
        text: p.text || "",
        confidence: p.confidence,
        width: p.width ?? null,
        height: p.height ?? null,
        tokens: p.tokens ? (p.tokens as any) : null,
      })),
    });

    const status = res.isScanned ? "NEEDS_OCR" : "DONE";
    await prisma.submissionExtractionRun.update({
      where: { id: run.id },
      data: {
        status,
        isScanned: res.isScanned,
        overallConfidence: res.overallConfidence,
        pageCount: res.pages.length,
        warnings: res.warnings ? (res.warnings as any) : null,
        sourceMeta: {
          kind: res.kind,
          detectedMime: res.detectedMime,
        } as any,
        finishedAt: new Date(),
      },
    });

    // Convenience: store concatenated text on Submission for later grading.
    const fullText = res.pages
      .map((p) => `\n\n--- PAGE ${p.pageNumber} ---\n\n${p.text || ""}`)
      .join("");

    await prisma.submission.update({
      where: { id },
      data: {
        extractedText: fullText || null,
        status: res.isScanned ? "NEEDS_OCR" : "EXTRACTED",
      },
    });

    return NextResponse.json({ ok: true, runId: run.id, ...res });
  } catch (e: any) {
    const msg = String(e?.message || e);

    await prisma.submissionExtractionRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: msg, finishedAt: new Date() },
    });

    await prisma.submission.update({
      where: { id },
      data: { status: "FAILED" },
    });

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
