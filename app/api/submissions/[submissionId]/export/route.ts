import { NextResponse } from "next/server";
import { createSubmissionExportPack } from "@/lib/submissions/exportPack";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { assessmentId?: string | null };
    const assessmentId = String(body?.assessmentId || "").trim() || null;
    const actor = await getCurrentAuditActor();
    const pack = await createSubmissionExportPack({ submissionId, assessmentId, actor });

    const fileUrls = pack.files.map((f) => ({
      ...f,
      downloadUrl: `/api/submissions/${submissionId}/exports/${pack.exportId}/file?name=${encodeURIComponent(f.name)}`,
    }));

    return NextResponse.json({
      ok: true,
      pack: {
        ...pack,
        files: fileUrls,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to generate export pack." },
      { status: 500 }
    );
  }
}

