import { NextResponse } from "next/server";
import { replaySubmissionExportPack } from "@/lib/submissions/exportPack";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { exportId?: string | null };
    const exportId = String(body?.exportId || "").trim();
    if (!exportId) {
      return NextResponse.json({ error: "exportId is required." }, { status: 400 });
    }
    const result = await replaySubmissionExportPack({ submissionId, exportId });
    return NextResponse.json({ ok: true, replay: result });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to replay export pack." },
      { status: 500 }
    );
  }
}

