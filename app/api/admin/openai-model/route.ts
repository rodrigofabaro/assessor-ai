import { NextResponse } from "next/server";
import { readOpenAiModel, writeOpenAiModel } from "@/lib/openai/modelConfig";
import { getSettingsWriteContext } from "@/lib/admin/settingsPermissions";
import { appendSettingsAuditEvent } from "@/lib/admin/settingsAudit";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";

const ALLOWED_MODELS = [
  "gpt-4.1-mini",
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-5-mini",
] as const;

export const runtime = "nodejs";

export async function GET() {
  const model = readOpenAiModel();
  return NextResponse.json({
    model: model.model,
    autoCleanupApproved: !!model.autoCleanupApproved,
    source: model.source,
    allowedModels: ALLOWED_MODELS,
  });
}

export async function PUT(req: Request) {
  try {
    const ctx = await getSettingsWriteContext();
    if (!ctx.canWrite) {
      return NextResponse.json({ error: "Insufficient role for model settings." }, { status: 403 });
    }

    const body = (await req.json()) as { model?: string; autoCleanupApproved?: boolean };
    const model = String(body?.model || "").trim();
    if (!model) return NextResponse.json({ error: "Model is required." }, { status: 400 });
    if (!ALLOWED_MODELS.includes(model as (typeof ALLOWED_MODELS)[number])) {
      return NextResponse.json({ error: "Unsupported model." }, { status: 400 });
    }
    const prev = readOpenAiModel();
    const saved = writeOpenAiModel(model, { autoCleanupApproved: !!body?.autoCleanupApproved });
    appendSettingsAuditEvent({
      actor: await getCurrentAuditActor(),
      role: ctx.role,
      action: "MODEL_UPDATED",
      target: "openai-model",
      changes: {
        modelFrom: prev.model,
        modelTo: saved.model,
        autoCleanupApprovedFrom: !!prev.autoCleanupApproved,
        autoCleanupApprovedTo: !!saved.autoCleanupApproved,
      },
    });
    return NextResponse.json({
      ok: true,
      model: saved.model,
      autoCleanupApproved: !!saved.autoCleanupApproved,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save model.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
