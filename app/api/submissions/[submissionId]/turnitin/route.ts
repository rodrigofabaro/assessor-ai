import { NextResponse } from "next/server";
import { getTurnitinSubmissionState } from "@/lib/turnitin/state";
import {
  TurnitinServiceError,
  readTurnitinCapability,
  refreshTurnitinSubmission,
  refreshTurnitinViewerUrl,
  sendSubmissionToTurnitin,
  syncTurnitinSubmission,
} from "@/lib/turnitin/service";

type TurnitinAction = "send" | "refresh" | "viewer" | "sync";

function asAction(value: unknown): TurnitinAction {
  const v = String(value || "").trim().toLowerCase();
  if (v === "send" || v === "refresh" || v === "viewer") return v;
  return "sync";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await ctx.params;
  const capability = readTurnitinCapability();
  const state = getTurnitinSubmissionState(submissionId);
  return NextResponse.json({
    ok: true,
    capability,
    state,
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = asAction((body as any)?.action);

  try {
    let state = null;
    if (action === "send") state = await sendSubmissionToTurnitin(submissionId);
    else if (action === "refresh") state = await refreshTurnitinSubmission(submissionId);
    else if (action === "viewer") state = await refreshTurnitinViewerUrl(submissionId);
    else state = await syncTurnitinSubmission(submissionId);

    return NextResponse.json({
      ok: true,
      action,
      capability: readTurnitinCapability(),
      state,
    });
  } catch (error) {
    const status =
      error instanceof TurnitinServiceError
        ? error.status
        : 500;
    return NextResponse.json(
      {
        ok: false,
        action,
        error: String((error as Error)?.message || error || "Turnitin action failed."),
        capability: readTurnitinCapability(),
        state: getTurnitinSubmissionState(submissionId),
      },
      { status }
    );
  }
}
