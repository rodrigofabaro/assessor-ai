import { NextResponse } from "next/server";
import { readGradingConfig, resolveFeedbackTemplate, writeGradingConfig } from "@/lib/grading/config";
import { getSettingsReadContext, getSettingsWriteContext } from "@/lib/admin/settingsPermissions";
import { appendSettingsAuditEvent } from "@/lib/admin/settingsAudit";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";
import { FEEDBACK_TEMPLATE_ALL_TOKENS, FEEDBACK_TEMPLATE_REQUIRED_TOKENS } from "@/lib/grading/feedbackDocument";

export const runtime = "nodejs";

export async function GET() {
  const readCtx = await getSettingsReadContext();
  if (!readCtx.canRead) {
    return NextResponse.json({ error: "Insufficient role for settings read." }, { status: 403 });
  }
  const { config, source } = readGradingConfig();
  const templateResolution = resolveFeedbackTemplate(config, readCtx.user?.id || null);
  return NextResponse.json({
    ...config,
    feedbackTemplate: templateResolution.template,
    feedbackTemplateScope: templateResolution.scope,
    activeTemplateUserId: templateResolution.userId,
    feedbackTemplateByUserCount: Object.keys(config.feedbackTemplateByUserId || {}).length,
    feedbackTemplateAllTokens: FEEDBACK_TEMPLATE_ALL_TOKENS,
    feedbackTemplateRequiredTokens: FEEDBACK_TEMPLATE_REQUIRED_TOKENS,
    source,
  });
}

export async function PUT(req: Request) {
  try {
    const ctx = await getSettingsWriteContext();
    if (!ctx.canWrite) {
      return NextResponse.json({ error: "Insufficient role for grading settings." }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const templateScope =
      String(body.feedbackTemplateScope || "").trim().toLowerCase() === "default"
        ? "default"
        : "active-user";
    const templateInput = typeof body.feedbackTemplate === "string" ? body.feedbackTemplate : null;
    if (typeof templateInput === "string") {
      const missing = FEEDBACK_TEMPLATE_REQUIRED_TOKENS.filter((t) => !templateInput.includes(t));
      if (missing.length) {
        return NextResponse.json(
          { error: `feedbackTemplate is missing required placeholder(s): ${missing.join(", ")}` },
          { status: 400 }
        );
      }
    }
    const prev = readGradingConfig().config;
    const nextTemplateByUserId = { ...(prev.feedbackTemplateByUserId || {}) };
    if (templateInput !== null) {
      if (templateScope === "active-user" && ctx.user?.id) {
        nextTemplateByUserId[ctx.user.id] = templateInput;
      }
    }
    const saved = writeGradingConfig({
      model: typeof body.model === "string" ? body.model : undefined,
      tone: body.tone as any,
      strictness: body.strictness as any,
      useRubricIfAvailable: body.useRubricIfAvailable as any,
      studentSafeMarkedPdf: body.studentSafeMarkedPdf as any,
      maxFeedbackBullets: body.maxFeedbackBullets as any,
      feedbackTemplate:
        templateInput !== null && (templateScope === "default" || !ctx.user?.id) ? templateInput : undefined,
      feedbackTemplateByUserId:
        templateInput !== null && templateScope === "active-user" && ctx.user?.id
          ? nextTemplateByUserId
          : undefined,
      pageNotesEnabled: body.pageNotesEnabled as any,
      pageNotesTone: body.pageNotesTone as any,
      pageNotesMaxPages: body.pageNotesMaxPages as any,
      pageNotesMaxLinesPerPage: body.pageNotesMaxLinesPerPage as any,
      pageNotesIncludeCriterionCode: body.pageNotesIncludeCriterionCode as any,
      pageNotesAiPolishEnabled: body.pageNotesAiPolishEnabled as any,
    });
    const templateResolution = resolveFeedbackTemplate(saved, ctx.user?.id || null);
    appendSettingsAuditEvent({
      actor: await getCurrentAuditActor(),
      role: ctx.role,
      action: "GRADING_CONFIG_UPDATED",
      target: "grading-config",
      changes: {
        toneFrom: prev.tone,
        toneTo: saved.tone,
        strictnessFrom: prev.strictness,
        strictnessTo: saved.strictness,
        studentSafeMarkedPdfFrom: prev.studentSafeMarkedPdf,
        studentSafeMarkedPdfTo: saved.studentSafeMarkedPdf,
        maxFeedbackBulletsFrom: prev.maxFeedbackBullets,
        maxFeedbackBulletsTo: saved.maxFeedbackBullets,
        feedbackTemplateScope: templateInput !== null ? (templateScope === "default" || !ctx.user?.id ? "default" : "active-user") : undefined,
        feedbackTemplateByUserCountFrom: Object.keys(prev.feedbackTemplateByUserId || {}).length,
        feedbackTemplateByUserCountTo: Object.keys(saved.feedbackTemplateByUserId || {}).length,
        pageNotesEnabledFrom: prev.pageNotesEnabled,
        pageNotesEnabledTo: saved.pageNotesEnabled,
        pageNotesAiPolishEnabledFrom: prev.pageNotesAiPolishEnabled,
        pageNotesAiPolishEnabledTo: saved.pageNotesAiPolishEnabled,
      },
    });
    return NextResponse.json({
      ok: true,
      config: {
        ...saved,
        feedbackTemplate: templateResolution.template,
        feedbackTemplateScope: templateResolution.scope,
        activeTemplateUserId: templateResolution.userId,
        feedbackTemplateByUserCount: Object.keys(saved.feedbackTemplateByUserId || {}).length,
        feedbackTemplateAllTokens: FEEDBACK_TEMPLATE_ALL_TOKENS,
        feedbackTemplateRequiredTokens: FEEDBACK_TEMPLATE_REQUIRED_TOKENS,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save grading config.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
