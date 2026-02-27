import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import { writeIvAdUpload } from "@/lib/iv-ad/storage";
import path from "path";

function isDocxFile(file: File) {
  const ext = path.extname(String(file?.name || "")).toLowerCase();
  return ext === ".docx";
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

export async function GET() {
  const requestId = makeRequestId();
  const denied = await ensureAdmin("/api/admin/iv-ad/template", requestId);
  if (denied) return denied;

  const activeTemplate = await prisma.ivAdTemplate.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    { activeTemplate, requestId },
    { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const requestId = makeRequestId();
  const denied = await ensureAdmin("/api/admin/iv-ad/template", requestId);
  if (denied) return denied;

  try {
    const formData = await req.formData();
    const fileEntry = formData.get("template");
    if (!(fileEntry instanceof File)) {
      return apiError({
        status: 400,
        code: "IV_AD_TEMPLATE_MISSING",
        userMessage: "Template DOCX is required.",
        route: "/api/admin/iv-ad/template",
        requestId,
      });
    }
    if (!isDocxFile(fileEntry)) {
      return apiError({
        status: 400,
        code: "IV_AD_TEMPLATE_INVALID_TYPE",
        userMessage: "Template must be a DOCX file.",
        route: "/api/admin/iv-ad/template",
        requestId,
      });
    }

    const saved = await writeIvAdUpload({ bucket: "templates", file: fileEntry, prefix: "template" });

    const template = await prisma.$transaction(async (tx) => {
      await tx.ivAdTemplate.updateMany({ where: { isActive: true }, data: { isActive: false } });
      return tx.ivAdTemplate.create({
        data: {
          filename: fileEntry.name,
          storagePath: saved.storagePath,
          mimeType:
            fileEntry.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          isActive: true,
        },
      });
    });

    return NextResponse.json(
      { template, requestId },
      { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return apiError({
      status: 500,
      code: "IV_AD_TEMPLATE_UPLOAD_FAILED",
      userMessage: "Failed to upload IV template.",
      route: "/api/admin/iv-ad/template",
      requestId,
      cause: err,
    });
  }
}

