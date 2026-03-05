import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestOrganizationId } from "@/lib/auth/requestSession";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import { isOrgScopeCompatError, isSpecSuiteJobSchemaMissing } from "@/lib/specSuite/jobSchema";

function normalizeFilename(value: string) {
  return String(value || "spec-suite-report")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^\w.\- ]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function findVisibleJob(jobId: string, organizationId: string | null) {
  if (!organizationId) {
    return prisma.specSuiteImportJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        sourceOriginalFilename: true,
        reportJson: true,
        resultSummary: true,
      },
    });
  }
  try {
    return await prisma.specSuiteImportJob.findFirst({
      where: { id: jobId, organizationId } as any,
      select: {
        id: true,
        sourceOriginalFilename: true,
        reportJson: true,
        resultSummary: true,
      },
    });
  } catch (error) {
    if (!isOrgScopeCompatError(error)) throw error;
    return prisma.specSuiteImportJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        sourceOriginalFilename: true,
        reportJson: true,
        resultSummary: true,
      },
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

    const reportPayload = (job.reportJson as any) || {
      generatedAt: new Date().toISOString(),
      sourceOriginalFilename: job.sourceOriginalFilename,
      summary: job.resultSummary || null,
      note: "No detailed report payload was captured for this job.",
    };
    const safeBase = normalizeFilename(job.sourceOriginalFilename || `spec-suite-${normalizedJobId}`);
    const fileName = `${safeBase}-import-report.json`;

    return new NextResponse(JSON.stringify(reportPayload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename=\"${fileName}\"`,
      },
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
        error: raw || "Failed to generate spec suite report.",
        code: "SPEC_SUITE_JOB_REPORT_FAILED",
      },
      { status: 500 },
    );
  }
}
