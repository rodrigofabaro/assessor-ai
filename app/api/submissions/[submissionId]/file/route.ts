import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { addOrganizationReadScope, getRequestOrganizationId } from "@/lib/auth/requestSession";
import { resolveStorageAbsolutePathAsync } from "@/lib/storage/provider";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await ctx.params;
  const organizationId = await getRequestOrganizationId();

  const sub = await prisma.submission.findFirst({
    where: addOrganizationReadScope({ id: submissionId }, organizationId) as any,
    select: { storagePath: true, filename: true },
  });

  if (!sub) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const filePath = String(sub.storagePath || "").trim();
  const absPath = filePath ? await resolveStorageAbsolutePathAsync(filePath) : null;
  if (!filePath || !absPath || !fs.existsSync(absPath)) {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }

  const ext = path.extname(sub.filename || filePath).toLowerCase();
  const buf = fs.readFileSync(absPath);

  // Basic content-types (we only upload PDF/DOCX today).
  const contentType =
    ext === ".pdf"
      ? "application/pdf"
      : ext === ".docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/octet-stream";

  return new NextResponse(buf, {
    headers: {
      "Content-Type": contentType,
      // Inline so it previews in the browser.
      "Content-Disposition": `inline; filename="${encodeURIComponent(sub.filename || "submission")}"`,
      "Cache-Control": "no-store",
    },
  });
}
