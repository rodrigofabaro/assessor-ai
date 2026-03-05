import { NextResponse } from "next/server";
import { head, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { appendOpsEvent } from "@/lib/ops/eventLog";
import { getRequestOrganizationId } from "@/lib/auth/requestSession";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import {
  importPearsonSpecSuiteFromPdf,
  SPEC_SUITE_DEFAULT_CATEGORY,
  SPEC_SUITE_DEFAULT_FRAMEWORK,
} from "@/lib/specSuite/importFromDescriptor";
import { isOrgScopeCompatError, isSpecSuiteJobSchemaMissing } from "@/lib/specSuite/jobSchema";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_SPEC_SUITE_UPLOAD_BYTES = 250 * 1024 * 1024; // 250MB

const jobSelect = {
  id: true,
  status: true,
  organizationId: true,
  sourceBlobUrl: true,
  sourceBlobPathname: true,
  sourceOriginalFilename: true,
  sourceSizeBytes: true,
  framework: true,
  category: true,
  cleanupSourceUpload: true,
  progressLabel: true,
  progressPercent: true,
  resultSummary: true,
  errorMessage: true,
  attemptCount: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  updatedAt: true,
  reportJson: true,
};

function isPdfUpload(fileName: string, contentType: string) {
  return String(contentType || "").toLowerCase() === "application/pdf" || String(fileName || "").toLowerCase().endsWith(".pdf");
}

function toResponseJob(job: any) {
  return {
    id: job.id,
    status: job.status,
    sourceOriginalFilename: job.sourceOriginalFilename,
    sourceSizeBytes: job.sourceSizeBytes,
    framework: job.framework,
    category: job.category,
    cleanupSourceUpload: job.cleanupSourceUpload,
    progressLabel: job.progressLabel,
    progressPercent: job.progressPercent,
    resultSummary: job.resultSummary,
    errorMessage: job.errorMessage,
    attemptCount: job.attemptCount,
    createdAt: job.createdAt?.toISOString?.() || null,
    startedAt: job.startedAt?.toISOString?.() || null,
    finishedAt: job.finishedAt?.toISOString?.() || null,
    updatedAt: job.updatedAt?.toISOString?.() || null,
    reportAvailable: Boolean(job.reportJson),
  };
}

async function downloadBlobBytes(url: string, token: string) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Blob fetch failed (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function findVisibleJob(jobId: string, organizationId: string | null) {
  if (!organizationId) {
    return prisma.specSuiteImportJob.findUnique({
      where: { id: jobId },
      select: jobSelect,
    });
  }
  try {
    return await prisma.specSuiteImportJob.findFirst({
      where: { id: jobId, organizationId } as any,
      select: jobSelect,
    });
  } catch (error) {
    if (!isOrgScopeCompatError(error)) throw error;
    return prisma.specSuiteImportJob.findUnique({
      where: { id: jobId },
      select: jobSelect,
    });
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const allowed = await isAdminMutationAllowed();
  if (!allowed.ok) {
    return NextResponse.json({ error: "ADMIN_PERMISSION_REQUIRED", message: allowed.reason }, { status: 403 });
  }

  let runningJob: any = null;
  let token = "";

  try {
    const { jobId } = await params;
    const normalizedJobId = String(jobId || "").trim();
    if (!normalizedJobId) {
      return NextResponse.json({ error: "Missing job id." }, { status: 400 });
    }

    const organizationId = await getRequestOrganizationId();
    const visibleJob = await findVisibleJob(normalizedJobId, organizationId);
    if (!visibleJob) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    if (visibleJob.status === "RUNNING" || visibleJob.status === "SUCCEEDED") {
      return NextResponse.json({ job: toResponseJob(visibleJob) });
    }

    const claim = await prisma.specSuiteImportJob.updateMany({
      where: {
        id: normalizedJobId,
        status: { in: ["QUEUED", "FAILED"] },
      },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        finishedAt: null,
        progressLabel: "Starting import...",
        progressPercent: 1,
        errorMessage: null,
        reportJson: null,
        resultSummary: null,
        attemptCount: {
          increment: 1,
        },
      } as any,
    });
    if (claim.count === 0) {
      const latest = await findVisibleJob(normalizedJobId, organizationId);
      if (!latest) return NextResponse.json({ error: "Job not found." }, { status: 404 });
      return NextResponse.json({ job: toResponseJob(latest) });
    }

    runningJob = await prisma.specSuiteImportJob.findUnique({
      where: { id: normalizedJobId },
      select: jobSelect,
    });
    if (!runningJob) {
      return NextResponse.json({ error: "Job not found after claim." }, { status: 404 });
    }

    const backend = String(process.env.STORAGE_BACKEND || "filesystem").trim().toLowerCase();
    if (backend !== "vercel_blob") {
      throw new Error("Spec suite jobs require STORAGE_BACKEND=vercel_blob.");
    }
    token = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");

    let lastProgressPercent = -1;
    let lastProgressLabel = "";
    const updateProgress = async (label: string, percent: number) => {
      const normalizedPercent = Math.max(0, Math.min(100, Math.round(percent)));
      if (normalizedPercent === lastProgressPercent && label === lastProgressLabel) return;
      if (lastProgressPercent >= 0 && Math.abs(normalizedPercent - lastProgressPercent) < 2 && label === lastProgressLabel) return;
      lastProgressPercent = normalizedPercent;
      lastProgressLabel = label;
      await prisma.specSuiteImportJob.update({
        where: { id: normalizedJobId },
        data: {
          progressLabel: label,
          progressPercent: normalizedPercent,
        },
      });
    };

    await updateProgress("Validating source descriptor upload...", 5);
    const blobMeta = await head(runningJob.sourceBlobUrl, { token });
    if (!blobMeta?.url) throw new Error("Source upload metadata is missing.");
    if (runningJob.sourceBlobPathname && runningJob.sourceBlobPathname !== blobMeta.pathname) {
      throw new Error("Source upload pathname mismatch.");
    }
    if (blobMeta.size > MAX_SPEC_SUITE_UPLOAD_BYTES) {
      throw new Error(`File too large (max ${Math.floor(MAX_SPEC_SUITE_UPLOAD_BYTES / (1024 * 1024))}MB).`);
    }
    if (!isPdfUpload(runningJob.sourceOriginalFilename, String(blobMeta.contentType || ""))) {
      throw new Error("Only PDF files are supported.");
    }

    await updateProgress("Downloading descriptor PDF...", 10);
    const pdfBytes = await downloadBlobBytes(blobMeta.url, token);

    const framework = String(runningJob.framework || "").trim() || SPEC_SUITE_DEFAULT_FRAMEWORK;
    const category = String(runningJob.category || "").trim() || SPEC_SUITE_DEFAULT_CATEGORY;

    const result = await importPearsonSpecSuiteFromPdf({
      pdfBytes,
      sourceOriginalFilename: runningJob.sourceOriginalFilename,
      organizationId: runningJob.organizationId || null,
      framework,
      category,
      onProgress: async (u) => {
        await updateProgress(u.label, u.percent);
      },
    });

    const succeeded = await prisma.specSuiteImportJob.update({
      where: { id: normalizedJobId },
      data: {
        status: "SUCCEEDED",
        progressLabel: "Import complete",
        progressPercent: 100,
        resultSummary: result.summary as any,
        reportJson: result.report as any,
        errorMessage: null,
        finishedAt: new Date(),
      },
      select: jobSelect,
    });

    appendOpsEvent({
      type: "SPEC_SUITE_IMPORT_JOB_SUCCEEDED",
      route: "/api/admin/spec-suite/jobs/[jobId]/run",
      status: 200,
      details: {
        jobId: normalizedJobId,
        importedCount: result.summary.importedCount,
        created: result.summary.created,
        updated: result.summary.updated,
        missingRequestedCount: result.summary.missingRequestedCount,
      },
    });

    if (runningJob.cleanupSourceUpload && token) {
      try {
        await del(runningJob.sourceBlobUrl, { token });
      } catch {
        // non-blocking cleanup
      }
    }

    return NextResponse.json({ job: toResponseJob(succeeded) });
  } catch (error) {
    const message = String((error as { message?: unknown } | null)?.message || error || "").trim() || "Spec suite import job failed.";
    if (runningJob?.id) {
      try {
        await prisma.specSuiteImportJob.update({
          where: { id: runningJob.id },
          data: {
            status: "FAILED",
            progressLabel: "Import failed",
            errorMessage: message,
            finishedAt: new Date(),
          },
        });
      } catch {
        // best effort
      }
      appendOpsEvent({
        type: "SPEC_SUITE_IMPORT_JOB_FAILED",
        route: "/api/admin/spec-suite/jobs/[jobId]/run",
        status: 500,
        details: {
          jobId: runningJob.id,
          error: message,
        },
      });
      if (runningJob.cleanupSourceUpload && runningJob.sourceBlobUrl && token) {
        try {
          await del(runningJob.sourceBlobUrl, { token });
        } catch {
          // non-blocking cleanup
        }
      }
    }

    if (isSpecSuiteJobSchemaMissing(error)) {
      return NextResponse.json(
        {
          error: "Spec suite jobs table is missing. Run database migrations and redeploy.",
          code: "SPEC_SUITE_JOB_SCHEMA_MISSING",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: message,
        code: "SPEC_SUITE_JOB_RUN_FAILED",
      },
      { status: 500 },
    );
  }
}
