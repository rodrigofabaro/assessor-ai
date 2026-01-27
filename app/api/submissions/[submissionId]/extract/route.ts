import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractFile } from "@/lib/extraction";
import { randomUUID } from "crypto";

const MIN_MEANINGFUL_TEXT_CHARS = 200;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ submissionId: string }> } | { params: { submissionId: string } }
) {
  // Next.js 15 can provide params as an async value ("sync dynamic APIs" warning).
  // Handle both shapes safely.
  const rawParams: any = (ctx as any).params;
  const resolvedParams = typeof rawParams?.then === "function" ? await rawParams : rawParams;
  const submissionId = String(resolvedParams?.submissionId || "");

  if (!submissionId) {
    return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
  }

  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const runId = randomUUID();
  const startedAt = new Date();

  await prisma.submissionExtractionRun.create({
    data: {
      id: runId,
      status: "RUNNING",
      isScanned: false,
      overallConfidence: 0,
      engineVersion: "extract-v2", // bump so you can see new runs are using new logic
      startedAt,
      submissionId,
    },
  });

  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: "EXTRACTING" },
  });

  try {
    const res = await extractFile(submission.storagePath, submission.filename);

    // ✅ Source of truth: combined text, not the heuristic flag
    const combinedText = (res.pages ?? [])
      .map((p) => (p?.text ?? "").trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();

    const hasMeaningfulText = combinedText.length >= MIN_MEANINGFUL_TEXT_CHARS;

    // If we have meaningful text, we override "scanned"
    const finalIsScanned = !hasMeaningfulText;
    const finalStatus = finalIsScanned ? "NEEDS_OCR" : "DONE";
    const finalSubmissionStatus = finalIsScanned ? "NEEDS_OCR" : "EXTRACTED";


    // Save pages (even if empty, save at least one for UI consistency)
    const pagesToSave =
      res.pages && res.pages.length
        ? res.pages
        : [
            {
              pageNumber: 1,
              text: "",
              confidence: 0,
              width: null,
              height: null,
              tokens: null,
            },
          ];

    await prisma.$transaction(
      pagesToSave.map((p) =>
        prisma.extractedPage.create({
          data: {
            id: randomUUID(),
            extractionRunId: runId,
            pageNumber: p.pageNumber,
            text: p.text ?? "",
            confidence: p.confidence ?? 0,
            width: p.width ?? null,
            height: p.height ?? null,
            tokens: p.tokens ?? null,
          },
        })
      )
    );

    const finishedAt = new Date();

    await prisma.submissionExtractionRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        isScanned: finalIsScanned,
        overallConfidence: hasMeaningfulText ? Math.max(res.overallConfidence ?? 0, 0.7) : 0,
        pageCount: pagesToSave.length,
        warnings: res.warnings ?? null,
        sourceMeta: {
          kind: res.kind,
          detectedMime: res.detectedMime ?? null,
          // Useful breadcrumbs:
          derivedTextChars: combinedText.length,
          rawIsScanned: res.isScanned,
          rawOverallConfidence: res.overallConfidence,
        } as any,
        finishedAt,
      },
    });

    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        extractedText: combinedText,
        status: finalSubmissionStatus,
      },
    });

    // Best-effort triage: populate studentId/assignmentId and make headers show up immediately.
    // Do NOT fail extraction if triage fails.
    try {
      const triageUrl = new URL(`/api/submissions/${submissionId}/triage`, request.url);
      await fetch(triageUrl.toString(), { method: "POST" });
    } catch (e) {
      console.warn("AUTO_TRIAGE_FAILED", e);
    }


    return NextResponse.json({
      ok: true,
      runId,
      status: finalStatus,
      isScanned: finalIsScanned,
      extractedChars: combinedText.length,
    });
  } catch (e: any) {
    const finishedAt = new Date();
    const msg = String(e?.message || e);

    await prisma.submissionExtractionRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        error: msg,
        finishedAt,
      },
    });

    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "FAILED" },
    });

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
