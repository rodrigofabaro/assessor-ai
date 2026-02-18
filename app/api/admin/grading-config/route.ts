import { NextResponse } from "next/server";
import { readGradingConfig, writeGradingConfig } from "@/lib/grading/config";

export const runtime = "nodejs";

const REQUIRED_TEMPLATE_TOKENS = ["{overallGrade}", "{feedbackBullets}"] as const;

export async function GET() {
  const { config, source } = readGradingConfig();
  return NextResponse.json({ ...config, source });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.feedbackTemplate === "string") {
      const tpl = body.feedbackTemplate;
      const missing = REQUIRED_TEMPLATE_TOKENS.filter((t) => !tpl.includes(t));
      if (missing.length) {
        return NextResponse.json(
          { error: `feedbackTemplate is missing required placeholder(s): ${missing.join(", ")}` },
          { status: 400 }
        );
      }
    }
    const saved = writeGradingConfig({
      model: typeof body.model === "string" ? body.model : undefined,
      tone: body.tone as any,
      strictness: body.strictness as any,
      useRubricIfAvailable: body.useRubricIfAvailable as any,
      maxFeedbackBullets: body.maxFeedbackBullets as any,
      feedbackTemplate: typeof body.feedbackTemplate === "string" ? body.feedbackTemplate : undefined,
      pageNotesEnabled: body.pageNotesEnabled as any,
      pageNotesTone: body.pageNotesTone as any,
      pageNotesMaxPages: body.pageNotesMaxPages as any,
      pageNotesMaxLinesPerPage: body.pageNotesMaxLinesPerPage as any,
      pageNotesIncludeCriterionCode: body.pageNotesIncludeCriterionCode as any,
    });
    return NextResponse.json({ ok: true, config: saved });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save grading config.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
