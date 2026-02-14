import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractFile } from "@/lib/extraction";
import { randomUUID } from "crypto";
import { apiError, makeRequestId } from "@/lib/api/errors";

const MIN_MEANINGFUL_TEXT_CHARS = 200;

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeText(s: string) {
  return (s || "")
    .replace(/\u00A0/g, " ")      // nbsp -> space
    .replace(/[ \t]+\n/g, "\n")   // trim trailing spaces before newline
    .replace(/\n{3,}/g, "\n\n")   // collapse runaway newlines
    .replace(/[ \t]{2,}/g, " ")   // collapse spaces
    .trim();
}

function combinePageText(pages: Array<{ text?: string | null }>) {
  const combined = pages
    .map((p) => normalizeText(p?.text ?? ""))
    .filter(Boolean)
    .join("\n\n");

  return normalizeText(combined);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const requestId = makeRequestId();
  const { submissionId } = await ctx.params;

  if (!submissionId) {
    return apiError({
      status: 400,
      code: "EXTRACT_MISSING_SUBMISSION_ID",
      userMessage: "Missing submission id.",
      route: "/api/submissions/[submissionId]/extract",
      requestId,
    });
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      filename: true,
      storagePath: true,
      status: true,
    },
  });

  if (!submission) {
    return apiError({
      status: 404,
      code: "EXTRACT_SUBMISSION_NOT_FOUND",
      userMessage: "Submission not found.",
      route: "/api/submissions/[submissionId]/extract",
      requestId,
      details: { submissionId },
    });
  }

  const runId = randomUUID();
  const startedAt = new Date();

  // Atomic "start run" + move submission to EXTRACTING
  await prisma.$transaction([
    prisma.submissionExtractionRun.create({
      data: {
        id: runId,
        status: "RUNNING",
        isScanned: false,
        overallConfidence: 0,
        engineVersion: "extract-v2",
        startedAt,
        submissionId,
      },
    }),
    prisma.submission.update({
      where: { id: submissionId },
      data: { status: "EXTRACTING" },
    }),
  ]);

  try {
    const res = await extractFile(submission.storagePath, submission.filename);

    // Ensure we always have at least one page for UI consistency
    const pages =
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

    const combinedText = combinePageText(pages as any);
    const hasMeaningfulText = combinedText.length >= MIN_MEANINGFUL_TEXT_CHARS;

    // Derived truth beats heuristic flags
    const finalIsScanned = !hasMeaningfulText;
    const finalRunStatus = finalIsScanned ? "NEEDS_OCR" : "DONE";
    const finalSubmissionStatus = finalIsScanned ? "NEEDS_OCR" : "EXTRACTED";

    // Confidence: prefer extractor confidence but clamp + boost slightly when meaningful text exists
    const rawOverall = clamp01(Number(res.overallConfidence ?? 0));
    const finalOverallConfidence = finalIsScanned ? 0 : Math.max(rawOverall, 0.7);

    const finishedAt = new Date();

    // Save pages + finalize run + update submission atomically
    await prisma.$transaction([
      prisma.extractedPage.createMany({
        data: pages.map((p: any) => ({
          id: randomUUID(),
          extractionRunId: runId,
          pageNumber: Number(p.pageNumber ?? 1),
          text: String(p.text ?? ""),
          confidence: Number(p.confidence ?? 0),
          width: p.width ?? null,
          height: p.height ?? null,
          tokens: p.tokens ?? null,
        })),
      }),

      prisma.submissionExtractionRun.update({
        where: { id: runId },
        data: {
          status: finalRunStatus,
          isScanned: finalIsScanned,
          overallConfidence: finalOverallConfidence,
          pageCount: pages.length,
          warnings: (res.warnings ?? null) as any,
          sourceMeta: {
            kind: res.kind,
            detectedMime: res.detectedMime ?? null,

            // breadcrumbs for QA/debugging
            derivedTextChars: combinedText.length,
            rawIsScanned: res.isScanned ?? null,
            rawOverallConfidence: res.overallConfidence ?? null,
          } as any,
          finishedAt,
        },
      }),

      prisma.submission.update({
        where: { id: submissionId },
        data: {
          extractedText: combinedText,
          status: finalSubmissionStatus,
        },
      }),
    ]);

    // Best-effort triage: do not block response
    try {
      const triageUrl = new URL(`/api/submissions/${submissionId}/triage`, request.url);
      // fire-and-forget (still awaited, but won't crash the request)
      await fetch(triageUrl.toString(), { method: "POST" });
    } catch (e) {
      console.warn("AUTO_TRIAGE_FAILED", e);
    }

    return NextResponse.json({
      ok: true,
      runId,
      status: finalRunStatus,
      isScanned: finalIsScanned,
      extractedChars: combinedText.length,
      requestId,
    }, { headers: { "x-request-id": requestId } });
  } catch (e: any) {
    const finishedAt = new Date();
    const msg = String(e?.message || e);

    // Make failure updates best-effort but consistent
    await prisma.$transaction([
      prisma.submissionExtractionRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          error: msg,
          finishedAt,
        },
      }),
      prisma.submission.update({
        where: { id: submissionId },
        data: { status: "FAILED" },
      }),
    ]);

    return apiError({
      status: 500,
      code: "EXTRACT_FAILED",
      userMessage: "Extraction failed.",
      route: "/api/submissions/[submissionId]/extract",
      requestId,
      details: { submissionId, runId },
      cause: msg,
    });
  }
}
