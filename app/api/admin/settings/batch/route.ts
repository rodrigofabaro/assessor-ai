import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuditActor, getOrCreateAppConfig } from "@/lib/admin/appConfig";
import { getSettingsWriteContext } from "@/lib/admin/settingsPermissions";
import { readOpenAiModel, writeOpenAiModel } from "@/lib/openai/modelConfig";
import { readGradingConfig, writeGradingConfig, type GradingConfig } from "@/lib/grading/config";
import { readAutomationPolicy, writeAutomationPolicy, type AutomationPolicy } from "@/lib/admin/automationPolicy";
import { appendSettingsAuditEvent } from "@/lib/admin/settingsAudit";
import { FEEDBACK_TEMPLATE_REQUIRED_TOKENS } from "@/lib/grading/feedbackDocument";

export const runtime = "nodejs";

const ALLOWED_MODELS = ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4o", "gpt-5-mini"] as const;
type BatchBody = {
  ai?: {
    model?: string;
    autoCleanupApproved?: boolean;
  };
  grading?: Partial<GradingConfig>;
  app?: {
    activeAuditUserId?: string | null;
    automationPolicy?: Partial<AutomationPolicy> | null;
  };
};

function validateGradingPayload(grading: Partial<GradingConfig>) {
  if (typeof grading.feedbackTemplate === "string") {
    const missing = FEEDBACK_TEMPLATE_REQUIRED_TOKENS.filter((token) => !grading.feedbackTemplate!.includes(token));
    if (missing.length) throw new Error(`feedbackTemplate is missing required placeholder(s): ${missing.join(", ")}`);
  }
}

export async function PUT(req: Request) {
  const ctx = await getSettingsWriteContext();
  if (!ctx.canWrite) {
    return NextResponse.json({ error: "Insufficient role for batch settings update." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as BatchBody;
  const aiRequested = !!body?.ai;
  const gradingRequested = !!body?.grading;
  const appRequested = !!body?.app;
  if (!aiRequested && !gradingRequested && !appRequested) {
    return NextResponse.json({ error: "No settings payload provided." }, { status: 400 });
  }

  const prevModel = readOpenAiModel();
  const prevGrading = readGradingConfig().config;
  const prevApp = await getOrCreateAppConfig();
  const prevPolicy = readAutomationPolicy().policy;

  let nextAuditUserId: string | null | undefined = undefined;
  if (appRequested && Object.prototype.hasOwnProperty.call(body.app || {}, "activeAuditUserId")) {
    const raw = body.app?.activeAuditUserId;
    nextAuditUserId = raw === null || raw === "" ? null : String(raw || "").trim();
    if (nextAuditUserId) {
      const user = await prisma.appUser.findUnique({ where: { id: nextAuditUserId } });
      if (!user) return NextResponse.json({ error: "Active audit user not found." }, { status: 404 });
    }
  }

  if (aiRequested) {
    const model = String(body.ai?.model || "").trim();
    if (!model) return NextResponse.json({ error: "Model is required." }, { status: 400 });
    if (!ALLOWED_MODELS.includes(model as (typeof ALLOWED_MODELS)[number])) {
      return NextResponse.json({ error: "Unsupported model." }, { status: 400 });
    }
  }
  if (gradingRequested) validateGradingPayload(body.grading || {});

  let appliedAi = false;
  let appliedGrading = false;
  let appliedAppConfig = false;
  let appliedPolicy = false;

  try {
    let modelResult: { model: string; autoCleanupApproved?: boolean; updatedAt?: string } | null = null;
    if (aiRequested) {
      modelResult = writeOpenAiModel(String(body.ai?.model || "").trim(), {
        autoCleanupApproved: !!body.ai?.autoCleanupApproved,
      });
      appliedAi = true;
      appendSettingsAuditEvent({
        actor: await getCurrentAuditActor(),
        role: ctx.role,
        action: "MODEL_UPDATED_BATCH",
        target: "openai-model",
        changes: {
          modelFrom: prevModel.model,
          modelTo: modelResult.model,
          autoCleanupApprovedFrom: !!prevModel.autoCleanupApproved,
          autoCleanupApprovedTo: !!modelResult.autoCleanupApproved,
        },
      });
    }

    let gradingResult: GradingConfig | null = null;
    if (gradingRequested) {
      const gradingInput = (body.grading || {}) as Record<string, unknown>;
      const templateInput = typeof gradingInput.feedbackTemplate === "string" ? gradingInput.feedbackTemplate : null;
      const templateScope =
        String(gradingInput.feedbackTemplateScope || "").trim().toLowerCase() === "default"
          ? "default"
          : "active-user";
      const nextTemplateByUserId = { ...(prevGrading.feedbackTemplateByUserId || {}) };
      if (templateInput !== null && templateScope === "active-user" && ctx.user?.id) {
        nextTemplateByUserId[ctx.user.id] = templateInput;
      }
      const gradingPatch: Partial<GradingConfig> = {
        model: typeof gradingInput.model === "string" ? gradingInput.model : undefined,
        tone: gradingInput.tone as any,
        strictness: gradingInput.strictness as any,
        useRubricIfAvailable: gradingInput.useRubricIfAvailable as any,
        studentSafeMarkedPdf: gradingInput.studentSafeMarkedPdf as any,
        maxFeedbackBullets: gradingInput.maxFeedbackBullets as any,
        pageNotesEnabled: gradingInput.pageNotesEnabled as any,
        pageNotesTone: gradingInput.pageNotesTone as any,
        pageNotesMaxPages: gradingInput.pageNotesMaxPages as any,
        pageNotesMaxLinesPerPage: gradingInput.pageNotesMaxLinesPerPage as any,
        pageNotesIncludeCriterionCode: gradingInput.pageNotesIncludeCriterionCode as any,
        pageNotesAiPolishEnabled: gradingInput.pageNotesAiPolishEnabled as any,
      };
      if (templateInput !== null && (templateScope === "default" || !ctx.user?.id)) {
        gradingPatch.feedbackTemplate = templateInput;
      }
      if (templateInput !== null && templateScope === "active-user" && ctx.user?.id) {
        gradingPatch.feedbackTemplateByUserId = nextTemplateByUserId;
      }
      gradingResult = writeGradingConfig({
        ...gradingPatch,
      });
      appliedGrading = true;
      appendSettingsAuditEvent({
        actor: await getCurrentAuditActor(),
        role: ctx.role,
        action: "GRADING_CONFIG_UPDATED_BATCH",
        target: "grading-config",
        changes: {
          toneFrom: prevGrading.tone,
          toneTo: gradingResult.tone,
          strictnessFrom: prevGrading.strictness,
          strictnessTo: gradingResult.strictness,
          studentSafeMarkedPdfFrom: prevGrading.studentSafeMarkedPdf,
          studentSafeMarkedPdfTo: gradingResult.studentSafeMarkedPdf,
          pageNotesAiPolishEnabledFrom: prevGrading.pageNotesAiPolishEnabled,
          pageNotesAiPolishEnabledTo: gradingResult.pageNotesAiPolishEnabled,
          feedbackTemplateByUserCountFrom: Object.keys(prevGrading.feedbackTemplateByUserId || {}).length,
          feedbackTemplateByUserCountTo: Object.keys(gradingResult.feedbackTemplateByUserId || {}).length,
        },
      });
    }

    let appResult: { activeAuditUserId: string | null } | null = null;
    if (appRequested && nextAuditUserId !== undefined) {
      const updated = await prisma.appConfig.upsert({
        where: { id: 1 },
        create: { id: 1, activeAuditUserId: nextAuditUserId || null },
        update: { activeAuditUserId: nextAuditUserId || null },
      });
      appliedAppConfig = true;
      appResult = { activeAuditUserId: updated.activeAuditUserId };
      appendSettingsAuditEvent({
        actor: await getCurrentAuditActor(),
        role: ctx.role,
        action: "APP_CONFIG_UPDATED_BATCH",
        target: "app-config",
        changes: {
          activeAuditUserIdFrom: prevApp.activeAuditUserId || null,
          activeAuditUserIdTo: updated.activeAuditUserId || null,
        },
      });
    }

    let policyResult: AutomationPolicy | null = null;
    if (appRequested && body.app?.automationPolicy && typeof body.app.automationPolicy === "object") {
      policyResult = writeAutomationPolicy(body.app.automationPolicy);
      appliedPolicy = true;
      appendSettingsAuditEvent({
        actor: await getCurrentAuditActor(),
        role: ctx.role,
        action: "AUTOMATION_POLICY_UPDATED_BATCH",
        target: "automation-policy",
        changes: {
          enabledFrom: prevPolicy.enabled,
          enabledTo: policyResult.enabled,
          providerModeFrom: prevPolicy.providerMode,
          providerModeTo: policyResult.providerMode,
          allowBatchGradingFrom: prevPolicy.allowBatchGrading,
          allowBatchGradingTo: policyResult.allowBatchGrading,
          requireOperationReasonFrom: prevPolicy.requireOperationReason,
          requireOperationReasonTo: policyResult.requireOperationReason,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      saved: {
        ai: appliedAi,
        grading: appliedGrading,
        appConfig: appliedAppConfig,
        automationPolicy: appliedPolicy,
      },
      results: {
        model: modelResult,
        grading: gradingResult,
        app: appResult,
        automationPolicy: policyResult,
      },
    });
  } catch (error) {
    const rollbackErrors: string[] = [];
    try {
      if (appliedAi) {
        writeOpenAiModel(prevModel.model, { autoCleanupApproved: !!prevModel.autoCleanupApproved });
      }
    } catch (e) {
      rollbackErrors.push(`AI rollback failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      if (appliedGrading) {
        writeGradingConfig(prevGrading);
      }
    } catch (e) {
      rollbackErrors.push(`Grading rollback failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      if (appliedAppConfig) {
        await prisma.appConfig.upsert({
          where: { id: 1 },
          create: { id: 1, activeAuditUserId: prevApp.activeAuditUserId || null },
          update: { activeAuditUserId: prevApp.activeAuditUserId || null },
        });
      }
    } catch (e) {
      rollbackErrors.push(`App config rollback failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      if (appliedPolicy) {
        writeAutomationPolicy(prevPolicy);
      }
    } catch (e) {
      rollbackErrors.push(`Automation policy rollback failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Batch settings save failed.",
        rollback: rollbackErrors.length ? { ok: false, errors: rollbackErrors } : { ok: true },
      },
      { status: 500 }
    );
  }
}
