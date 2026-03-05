import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestOrganizationId } from "@/lib/auth/requestSession";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import { isOrgScopeCompatError, isSpecSuiteJobSchemaMissing } from "@/lib/specSuite/jobSchema";

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

async function findVisibleJob(jobId: string, organizationId: string | null) {
  if (!organizationId) {
    return prisma.specSuiteImportJob.findUnique({
      where: { id: jobId },
      select: jobSelect,
    });
  }
  try {
    return await prisma.specSuiteImportJob.findFirst({
      where: {
        id: jobId,
        organizationId,
      } as any,
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const allowed = await isAdminMutationAllowed();
  if (!allowed.ok) {
    return NextResponse.json({ error: "ADMIN_PERMISSION_REQUIRED", message: allowed.reason }, { status: 403 });
  }

  try {
    const { jobId } = await params;
    const normalizedJobId = String(jobId || "").trim();
    if (!normalizedJobId) {
      return NextResponse.json({ error: "Missing job id." }, { status: 400 });
    }

    const organizationId = await getRequestOrganizationId();
    const job = await findVisibleJob(normalizedJobId, organizationId);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
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
        error: raw || "Failed to load spec suite job.",
        code: "SPEC_SUITE_JOB_GET_FAILED",
      },
      { status: 500 },
    );
  }
}
