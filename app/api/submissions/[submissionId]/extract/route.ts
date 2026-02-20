import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractFile } from "@/lib/extraction";
import { randomUUID } from "crypto";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { ocrPdfWithOpenAi } from "@/lib/ocr/openaiPdfOcr";
import { extractCoverMetadataFromPages, isCoverMetadataReady } from "@/lib/submissions/coverMetadata";
import { triggerAutoGradeIfAutoReady } from "@/lib/submissions/autoGrade";
import { maybeAutoSendTurnitinForSubmission } from "@/lib/turnitin/service";

const MIN_MEANINGFUL_TEXT_CHARS = 200;
const MIN_MEANINGFUL_PAGE_CHARS = 120;
const TARGET_PAGE_TEXT_CHARS = 900;

function envBool(name: string, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

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

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function computeFinalExtractionConfidence(input: {
  rawOverallConfidence: number;
  finalIsScanned: boolean;
  coverOnlyMode: boolean;
  coverReady: boolean;
  coverConfidence: number;
  combinedTextChars: number;
  pageConfidences: number[];
  meaningfulPageCount: number;
  pageCount: number;
  ocrSucceeded: boolean;
}) {
  if (input.finalIsScanned) return 0;

  const pageCount = Math.max(1, Number(input.pageCount || 0));
  const pageConfidenceAvg = clamp01(average(input.pageConfidences.map((v) => clamp01(Number(v || 0)))));
  const pageCoverageScore = clamp01(Number(input.meaningfulPageCount || 0) / pageCount);
  const perPageChars = Number(input.combinedTextChars || 0) / pageCount;
  const textDensityScore = clamp01(perPageChars / TARGET_PAGE_TEXT_CHARS);
  const rawOverallScore = clamp01(Number(input.rawOverallConfidence || 0));
  const coverConfidence = clamp01(Number(input.coverConfidence || 0));

  const baseScore = clamp01(
    rawOverallScore * 0.4 +
      pageConfidenceAvg * 0.25 +
      pageCoverageScore * 0.2 +
      textDensityScore * 0.15
  );

  if (input.coverOnlyMode) {
    const coverBlend = clamp01(coverConfidence * 0.7 + baseScore * 0.3);
    let score = input.coverReady ? Math.max(coverBlend, 0.72) : Math.max(coverBlend, 0.58);
    if (input.coverReady && coverConfidence >= 0.95) score = Math.min(0.99, score + 0.02);
    return clamp01(score);
  }

  let score = baseScore;
  if (input.ocrSucceeded) score = Math.min(0.96, score + 0.03);
  if (input.combinedTextChars >= Math.max(MIN_MEANINGFUL_TEXT_CHARS * 4, 1200)) {
    score = Math.min(0.97, score + 0.02);
  }
  if (input.combinedTextChars >= MIN_MEANINGFUL_TEXT_CHARS) score = Math.max(score, 0.68);
  return clamp01(score);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const requestId = makeRequestId();
  const { submissionId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const force = ["1", "true", "yes"].includes(String(searchParams.get("force") || "").toLowerCase());
  const mode = String(searchParams.get("mode") || "").trim().toLowerCase();

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
      extractedText: true,
      extractionRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { id: true, status: true, startedAt: true, finishedAt: true },
      },
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

  const latestRun = submission.extractionRuns?.[0] ?? null;

  // Idempotency guard #1: if extraction is already running, do not create another run.
  if (!force && (submission.status === "EXTRACTING" || latestRun?.status === "RUNNING")) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: "already-running",
        runId: latestRun?.id || null,
        requestId,
      },
      { headers: { "x-request-id": requestId } }
    );
  }

  // Idempotency guard #2: if extraction already completed and text exists, avoid duplicate reruns unless forced.
  if (
    !force &&
    latestRun &&
    (latestRun.status === "DONE" || latestRun.status === "NEEDS_OCR") &&
    String(submission.extractedText || "").trim().length >= MIN_MEANINGFUL_TEXT_CHARS
  ) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: "already-extracted",
        runId: latestRun.id,
        status: latestRun.status,
        requestId,
      },
      { headers: { "x-request-id": requestId } }
    );
  }

  const runId = randomUUID();
  const startedAt = new Date();

  // Acquire extraction lock to prevent duplicate parallel runs.
  if (!force) {
    const lock = await prisma.submission.updateMany({
      where: { id: submissionId, status: { not: "EXTRACTING" } },
      data: { status: "EXTRACTING" },
    });
    if (lock.count === 0) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "already-running",
          runId: latestRun?.id || null,
          requestId,
        },
        { headers: { "x-request-id": requestId } }
      );
    }
  } else {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "EXTRACTING" },
    });
  }

  await prisma.submissionExtractionRun.create({
    data: {
      id: runId,
      status: "RUNNING",
      isScanned: false,
      overallConfidence: 0,
      engineVersion: "extract-v2",
      startedAt,
      submissionId,
    },
  });

  try {
    const res = await extractFile(submission.storagePath, submission.filename);
    const coverOnlyMode =
      mode === "full"
        ? false
        : mode === "cover" || mode === "cover_only"
          ? true
          : envBool("SUBMISSION_EXTRACT_COVER_ONLY", true);
    const coverPageLimit = Math.max(1, Math.min(3, Number(process.env.SUBMISSION_EXTRACT_COVER_PAGE_LIMIT || 2)));

    // Ensure we always have at least one page for UI consistency
    const pagesRaw =
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
    const pages = coverOnlyMode
      ? pagesRaw
          .filter((p: any) => Number(p?.pageNumber || 0) > 0)
          .sort((a: any, b: any) => Number(a?.pageNumber || 0) - Number(b?.pageNumber || 0))
          .slice(0, coverPageLimit)
      : pagesRaw;

    let finalPages = pages as any[];
    let combinedText = combinePageText(finalPages as any);
    let hasMeaningfulText = combinedText.length >= MIN_MEANINGFUL_TEXT_CHARS;
    const ocrMeta: Record<string, unknown> = {
      attempted: false,
      succeeded: false,
      model: null,
      warnings: [] as string[],
    };

    // OCR fallback for scanned/low-text PDFs.
    if (!hasMeaningfulText && String(res.kind || "").toUpperCase() === "PDF") {
      ocrMeta.attempted = true;
      const ocr = await ocrPdfWithOpenAi({
        pdfPath: submission.storagePath,
        requestId,
      });
      ocrMeta.model = ocr.model || null;
      ocrMeta.warnings = ocr.warnings || [];
      if (ocr.ok && ocr.combinedText.length >= MIN_MEANINGFUL_TEXT_CHARS) {
        ocrMeta.succeeded = true;
        const ocrPages = ocr.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
          confidence: p.confidence,
          width: p.width ?? null,
          height: p.height ?? null,
          tokens: null,
        }));
        finalPages = coverOnlyMode
          ? ocrPages
              .filter((p) => Number(p?.pageNumber || 0) > 0)
              .sort((a, b) => Number(a?.pageNumber || 0) - Number(b?.pageNumber || 0))
              .slice(0, coverPageLimit)
          : ocrPages;
        combinedText = combinePageText(finalPages as any);
        hasMeaningfulText = combinedText.length >= MIN_MEANINGFUL_TEXT_CHARS;
      }
    }

    const coverMetadata = extractCoverMetadataFromPages(finalPages as any);

    // Derived truth beats heuristic flags. In cover-only mode, strong cover metadata
    // is enough to mark the run ready even when body text is intentionally short.
    const coverReady = coverOnlyMode && isCoverMetadataReady(coverMetadata);
    const finalIsScanned = coverOnlyMode ? false : !hasMeaningfulText;
    const finalRunStatus = finalIsScanned ? "NEEDS_OCR" : "DONE";
    const finalSubmissionStatus = finalIsScanned ? "NEEDS_OCR" : "EXTRACTED";

    const rawOverall = clamp01(Number(res.overallConfidence ?? 0));
    const pageConfidences = finalPages.map((p: any) => clamp01(Number(p?.confidence ?? 0)));
    const meaningfulPageCount = finalPages.filter(
      (p: any) => String(p?.text || "").trim().length >= MIN_MEANINGFUL_PAGE_CHARS
    ).length;
    const pageCount = Math.max(1, finalPages.length);
    const pageTextCoverage = meaningfulPageCount / pageCount;
    const averagePageConfidence = average(pageConfidences);
    const coverConfidence = clamp01(Number((coverMetadata as any)?.confidence || 0));
    const finalOverallConfidence = computeFinalExtractionConfidence({
      rawOverallConfidence: rawOverall,
      finalIsScanned,
      coverOnlyMode,
      coverReady,
      coverConfidence,
      combinedTextChars: combinedText.length,
      pageConfidences,
      meaningfulPageCount,
      pageCount: finalPages.length,
      ocrSucceeded: Boolean((ocrMeta as any)?.succeeded),
    });

    const finishedAt = new Date();
    const mergedWarnings = [...(res.warnings || []), ...((ocrMeta.warnings as string[]) || [])];
    if (coverOnlyMode && combinedText.length < MIN_MEANINGFUL_TEXT_CHARS) {
      mergedWarnings.push("cover-only mode: body extraction intentionally limited.");
    }
    if (coverOnlyMode && !coverReady) {
      mergedWarnings.push("cover metadata incomplete: can be completed manually in submission review.");
    }

    // Save pages + finalize run + update submission atomically
    await prisma.$transaction([
      prisma.extractedPage.createMany({
        data: finalPages.map((p: any) => ({
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
          pageCount: finalPages.length,
          warnings: (mergedWarnings.length ? mergedWarnings : null) as any,
          sourceMeta: {
            kind: res.kind,
            detectedMime: res.detectedMime ?? null,
            extractionMode: coverOnlyMode ? "COVER_ONLY" : "FULL",
            coverPageLimit: coverOnlyMode ? coverPageLimit : null,
            coverReady,
            coverMetadata,
            ocr: ocrMeta,

            // breadcrumbs for QA/debugging
            derivedTextChars: combinedText.length,
            extractedChars: combinedText.length,
            rawIsScanned: res.isScanned ?? null,
            rawOverallConfidence: res.overallConfidence ?? null,
            qualitySignals: {
              derivedTextChars: combinedText.length,
              pageCount: finalPages.length,
              meaningfulPageCount,
              pageTextCoverage: Number(pageTextCoverage.toFixed(3)),
              averagePageConfidence: Number(averagePageConfidence.toFixed(3)),
              coverConfidence: Number(coverConfidence.toFixed(3)),
              finalOverallConfidence: Number(finalOverallConfidence.toFixed(3)),
            },
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

    // Best-effort grading kickoff when submission resolves to AUTO_READY.
    try {
      await triggerAutoGradeIfAutoReady(submissionId, request.url);
    } catch (e) {
      console.warn("AUTO_GRADE_FAILED", e);
    }

    // Best-effort Turnitin auto-send (QA-only gate is enforced by turnitin service settings).
    try {
      await maybeAutoSendTurnitinForSubmission(submissionId);
    } catch (e) {
      console.warn("AUTO_TURNITIN_SEND_FAILED", e);
    }

    return NextResponse.json({
      ok: true,
      runId,
      status: finalRunStatus,
      isScanned: finalIsScanned,
      extractedChars: combinedText.length,
      coverReady,
      coverMetadata,
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

