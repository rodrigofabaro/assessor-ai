import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";
import { resolveStorageAbsolutePathAsync } from "@/lib/storage/provider";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await ctx.params;
  const organizationId = await getRequestOrganizationId();
  const visibleSubmission = await prisma.submission.findFirst({
    where: addOrganizationReadScope({ id: submissionId }, organizationId) as any,
    select: { id: true },
  });
  if (!visibleSubmission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const assessmentId = String(url.searchParams.get("assessmentId") || "").trim();
  const latest = assessmentId
    ? await prisma.assessment.findFirst({
        where: { id: assessmentId, submissionId },
        select: { annotatedPdfPath: true },
      })
    : await prisma.assessment.findFirst({
        where: { submissionId },
        orderBy: { createdAt: "desc" },
        select: { annotatedPdfPath: true },
      });
  const rel = String(latest?.annotatedPdfPath || "").trim();
  if (!rel) return NextResponse.json({ error: "No marked PDF generated yet." }, { status: 404 });

  const abs = await resolveStorageAbsolutePathAsync(rel);
  if (!abs || !fs.existsSync(abs)) {
    return NextResponse.json({ error: "Marked PDF file not found on disk." }, { status: 404 });
  }

  const bytes = fs.readFileSync(abs);
  return new NextResponse(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename=\"${path.basename(rel)}\"`,
      "cache-control": "no-store",
    },
  });
}
