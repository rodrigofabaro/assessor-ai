import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";

const ROUTE = "/api/admin/iv-ad/documents/[documentId]";

async function ensureAdmin(requestId: string) {
  const guard = await isAdminMutationAllowed();
  if (guard.ok) return null;
  return apiError({
    status: 403,
    code: "ADMIN_REQUIRED",
    userMessage: guard.reason || "Admin access required.",
    route: ROUTE,
    requestId,
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ documentId: string }> }
) {
  const requestId = makeRequestId();
  const denied = await ensureAdmin(requestId);
  if (denied) return denied;

  try {
    const { documentId } = await ctx.params;
    const document = await prisma.ivAdDocument.findUnique({
      where: { id: documentId },
      include: {
        template: {
          select: { id: true, filename: true, createdAt: true },
        },
      },
    });

    if (!document) {
      return apiError({
        status: 404,
        code: "IV_AD_DOCUMENT_NOT_FOUND",
        userMessage: "IV-AD document not found.",
        route: ROUTE,
        requestId,
      });
    }

    return NextResponse.json(
      {
        document,
        requestId,
      },
      { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return apiError({
      status: 500,
      code: "IV_AD_DOCUMENT_DETAIL_FAILED",
      userMessage: "Failed to load IV-AD document detail.",
      route: ROUTE,
      requestId,
      cause: err,
    });
  }
}
