import { NextResponse } from "next/server";
import { getSettingsReadContext, getSettingsWriteContext } from "@/lib/admin/settingsPermissions";
import { defaultGradingConfig } from "@/lib/grading/config";
import { defaultAutomationPolicy } from "@/lib/admin/automationPolicy";
import { getDefaultOpenAiModel } from "@/lib/openai/modelConfig";

export const runtime = "nodejs";

const ALLOWED_MODELS = ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4o", "gpt-5-mini"] as const;

export async function GET() {
  const readCtx = await getSettingsReadContext();
  const writeCtx = await getSettingsWriteContext();
  if (!readCtx.canRead) {
    return NextResponse.json({ error: "Insufficient role for settings read." }, { status: 403 });
  }

  return NextResponse.json({
    permissions: {
      role: writeCtx.role || readCtx.role,
      canRead: !!readCtx.canRead,
      canWrite: !!writeCtx.canWrite,
      source: writeCtx.source || readCtx.source || "unknown",
    },
    defaults: {
      ai: {
        model: getDefaultOpenAiModel(),
        autoCleanupApproved: false,
        allowedModels: ALLOWED_MODELS,
      },
      grading: defaultGradingConfig(),
      app: {
        automationPolicy: defaultAutomationPolicy(),
      },
    },
  });
}
