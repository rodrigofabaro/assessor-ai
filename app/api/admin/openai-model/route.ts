import { NextResponse } from "next/server";
import { readOpenAiModel, writeOpenAiModel } from "@/lib/openai/modelConfig";

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
    source: model.source,
    allowedModels: ALLOWED_MODELS,
  });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { model?: string };
    const model = String(body?.model || "").trim();
    if (!model) return NextResponse.json({ error: "Model is required." }, { status: 400 });
    if (!ALLOWED_MODELS.includes(model as (typeof ALLOWED_MODELS)[number])) {
      return NextResponse.json({ error: "Unsupported model." }, { status: 400 });
    }
    const saved = writeOpenAiModel(model);
    return NextResponse.json({
      ok: true,
      model: saved.model,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save model.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

