import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import { ivAdDocxContentType, ivAdToAbsolutePath } from "@/lib/iv-ad/storage";
import fs from "fs";

function sanitizeDownloadName(value: string) {
  return String(value || "")
    .replace(/[^\w.\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function ensureAdmin(route: string, requestId: string) {
  const guard = await isAdminMutationAllowed();
  if (guard.ok) return null;
  return apiError({
    status: 403,
    code: "ADMIN_REQUIRED",
    userMessage: guard.reason || "Admin access required.",
    route,
    requestId,
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ documentId: string }> }
) {
  const requestId = makeRequestId();
  const denied = await ensureAdmin("/api/admin/iv-ad/documents/[documentId]/file", requestId);
  if (denied) return denied;

  try {
    const { documentId } = await ctx.params;
    const doc = await prisma.ivAdDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        outputDocxPath: true,
        studentName: true,
        unitCodeTitle: true,
        grade: true,
        createdAt: true,
      },
    });
    if (!doc) {
      return apiError({
        status: 404,
        code: "IV_AD_DOCUMENT_NOT_FOUND",
        userMessage: "Generated IV document not found.",
        route: "/api/admin/iv-ad/documents/[documentId]/file",
        requestId,
      });
    }

    const abs = ivAdToAbsolutePath(doc.outputDocxPath);
    if (!fs.existsSync(abs)) {
      return apiError({
        status: 404,
        code: "IV_AD_OUTPUT_FILE_MISSING",
        userMessage: "Generated DOCX file is missing on disk.",
        route: "/api/admin/iv-ad/documents/[documentId]/file",
        requestId,
        details: { documentId: doc.id },
      });
    }

    const bytes = fs.readFileSync(abs);
    const datePart = new Date(doc.createdAt).toISOString().slice(0, 10);
    const filename = sanitizeDownloadName(
      `${doc.studentName || "student"}-${doc.unitCodeTitle || "unit"}-${doc.grade || "grade"}-${datePart}.docx`
    ) || `iv-ad-${doc.id}.docx`;

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": ivAdDocxContentType(),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "x-request-id": requestId,
      },
    });
  } catch (err) {
    return apiError({
      status: 500,
      code: "IV_AD_DOWNLOAD_FAILED",
      userMessage: "Failed to download generated DOCX.",
      route: "/api/admin/iv-ad/documents/[documentId]/file",
      requestId,
      cause: err,
    });
  }
}

