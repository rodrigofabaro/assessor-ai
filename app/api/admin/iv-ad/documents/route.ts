import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";

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

export async function GET(req: Request) {
  const requestId = makeRequestId();
  const denied = await ensureAdmin("/api/admin/iv-ad/documents", requestId);
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const templateIdParam = String(url.searchParams.get("templateId") || "").trim();
    let templateId = templateIdParam;

    if (!templateId || templateId === "active") {
      const active = await prisma.ivAdTemplate.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      templateId = String(active?.id || "");
    }

    if (!templateId) {
      return NextResponse.json(
        { documents: [], requestId },
        { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } }
      );
    }

    const documents = await prisma.ivAdDocument.findMany({
      where: { templateId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        template: {
          select: { id: true, filename: true, createdAt: true },
        },
      },
    });

    return NextResponse.json(
      { documents, requestId },
      { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return apiError({
      status: 500,
      code: "IV_AD_DOCUMENTS_LIST_FAILED",
      userMessage: "Failed to load IV document history.",
      route: "/api/admin/iv-ad/documents",
      requestId,
      cause: err,
    });
  }
}

