import { NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getRequestOrganizationId } from "@/lib/auth/requestSession";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import { isOrgScopeCompatError, isSpecSuiteJobSchemaMissing } from "@/lib/specSuite/jobSchema";

const MAX_SPEC_SUITE_UPLOAD_BYTES = 250 * 1024 * 1024; // 250MB

type CreateJobRequest = {
  sourceBlobUrl?: string;
  sourceBlobPathname?: string;
  sourceOriginalFilename?: string;
  framework?: string;
  category?: string;
  cleanupSourceUpload?: boolean;
};

function clampInt(raw: string | null, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function cleanMetaValue(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 120);
}

function isPdfUpload(fileName: string, contentType: string) {
  return String(contentType || "").toLowerCase() === "application/pdf" || String(fileName || "").toLowerCase().endsWith(".pdf");
}

const jobSelect = {
  id: true,
  status: true,
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

export async function GET(req: Request) {
  const allowed = await isAdminMutationAllowed();
  if (!allowed.ok) {
    return NextResponse.json({ error: "ADMIN_PERMISSION_REQUIRED", message: allowed.reason }, { status: 403 });
  }

  try {
    const organizationId = await getRequestOrganizationId();
    const url = new URL(req.url);
    const limit = clampInt(url.searchParams.get("limit"), 20, 1, 100);
    const where = organizationId ? { organizationId } : {};

    let rows;
    try {
      rows = await prisma.specSuiteImportJob.findMany({
        where: where as any,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: jobSelect,
      });
    } catch (error) {
      if (!organizationId || !isOrgScopeCompatError(error)) throw error;
      rows = await prisma.specSuiteImportJob.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: jobSelect,
      });
    }

    return NextResponse.json({
      jobs: rows.map(toResponseJob),
    });
  } catch (error) {
    if (isSpecSuiteJobSchemaMissing(error)) {
      return NextResponse.json(
        {
          error: "Spec suite jobs table is missing. Run database migrations and redeploy.",
          code: "SPEC_SUITE_JOB_SCHEMA_MISSING",
        },
        { status: 409 },
      );
    }
    const raw = String((error as { message?: unknown } | null)?.message || error || "").trim();
    return NextResponse.json(
      {
        error: raw || "Failed to load spec suite jobs.",
        code: "SPEC_SUITE_JOB_LIST_FAILED",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const allowed = await isAdminMutationAllowed();
  if (!allowed.ok) {
    return NextResponse.json({ error: "ADMIN_PERMISSION_REQUIRED", message: allowed.reason }, { status: 403 });
  }

  let sourceBlobUrl = "";
  let sourceBlobPathname = "";

  try {
    const organizationId = await getRequestOrganizationId();
    const backend = String(process.env.STORAGE_BACKEND || "filesystem").trim().toLowerCase();
    if (backend !== "vercel_blob") {
      return NextResponse.json(
        {
          error: "Spec suite jobs require STORAGE_BACKEND=vercel_blob.",
          code: "SPEC_SUITE_STORAGE_BACKEND_UNSUPPORTED",
        },
        { status: 409 },
      );
    }

    const token = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
    if (!token) {
      return NextResponse.json(
        {
          error: "Storage is not configured. Set BLOB_READ_WRITE_TOKEN in Vercel and redeploy.",
          code: "BLOB_TOKEN_MISSING",
        },
        { status: 500 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as CreateJobRequest;
    sourceBlobUrl = String(body.sourceBlobUrl || "").trim();
    sourceBlobPathname = String(body.sourceBlobPathname || "").trim().replace(/^\/+/, "");
    const sourceOriginalFilename = String(body.sourceOriginalFilename || "").trim();
    const framework = cleanMetaValue(body.framework) || null;
    const category = cleanMetaValue(body.category) || null;
    const cleanupSourceUpload = body.cleanupSourceUpload !== false;

    if (!sourceBlobUrl || !sourceOriginalFilename) {
      return NextResponse.json({ error: "Missing suite upload metadata." }, { status: 400 });
    }

    const blobMeta = await head(sourceBlobUrl, { token });
    if (!blobMeta?.url) {
      return NextResponse.json({ error: "Blob metadata is missing." }, { status: 400 });
    }
    if (sourceBlobPathname && sourceBlobPathname !== blobMeta.pathname) {
      return NextResponse.json({ error: "Blob pathname mismatch." }, { status: 400 });
    }
    if (blobMeta.size > MAX_SPEC_SUITE_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.floor(MAX_SPEC_SUITE_UPLOAD_BYTES / (1024 * 1024))}MB).` },
        { status: 413 },
      );
    }
    if (!isPdfUpload(sourceOriginalFilename, String(blobMeta.contentType || ""))) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    const baseData = {
      status: "QUEUED" as const,
      sourceBlobUrl: blobMeta.url,
      sourceBlobPathname: blobMeta.pathname || sourceBlobPathname || null,
      sourceOriginalFilename,
      sourceSizeBytes: blobMeta.size,
      framework,
      category,
      cleanupSourceUpload,
      progressLabel: "Queued for import",
      progressPercent: 0,
      createdBy: null,
    };
    const scopedData = organizationId
      ? {
          ...baseData,
          organizationId,
        }
      : baseData;

    let job: any;
    try {
      job = await prisma.specSuiteImportJob.create({
        data: scopedData as any,
        select: jobSelect,
      });
    } catch (error) {
      if (!isOrgScopeCompatError(error)) throw error;
      job = await prisma.specSuiteImportJob.create({
        data: baseData as any,
        select: jobSelect,
      });
    }

    return NextResponse.json({ job: toResponseJob(job) });
  } catch (error) {
    if (isSpecSuiteJobSchemaMissing(error)) {
      return NextResponse.json(
        {
          error: "Spec suite jobs table is missing. Run database migrations and redeploy.",
          code: "SPEC_SUITE_JOB_SCHEMA_MISSING",
        },
        { status: 409 },
      );
    }
    const raw = String((error as { message?: unknown } | null)?.message || error || "").trim();
    return NextResponse.json(
      {
        error: raw || "Failed to create spec suite job.",
        code: "SPEC_SUITE_JOB_CREATE_FAILED",
      },
      { status: 500 },
    );
  }
}
