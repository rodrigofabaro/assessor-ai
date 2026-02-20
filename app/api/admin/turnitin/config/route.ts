import { NextResponse } from "next/server";
import { getSettingsReadContext, getSettingsWriteContext } from "@/lib/admin/settingsPermissions";
import {
  maskApiKey,
  readTurnitinConfig,
  resolveTurnitinRuntimeConfig,
  writeTurnitinConfig,
} from "@/lib/turnitin/config";
import { appendSettingsAuditEvent } from "@/lib/admin/settingsAudit";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";

function buildPublicConfig() {
  const current = readTurnitinConfig();
  const runtime = resolveTurnitinRuntimeConfig();
  return {
    source: current.source,
    enabled: runtime.enabled,
    qaOnly: runtime.qaOnly,
    autoSendOnExtract: runtime.autoSendOnExtract,
    autoDetectAiWritingOnGrade: runtime.autoDetectAiWritingOnGrade,
    baseUrl: runtime.baseUrl,
    ownerUserId: runtime.ownerUserId,
    viewerUserId: runtime.viewerUserId,
    locale: runtime.locale,
    integrationName: runtime.integrationName,
    integrationVersion: runtime.integrationVersion,
    hasApiKey: Boolean(runtime.apiKey),
    apiKeyPreview: runtime.apiKey ? maskApiKey(runtime.apiKey) : "",
    apiKeySource: runtime.apiKeySource,
    updatedAt: current.config.updatedAt,
  };
}

export async function GET() {
  const readCtx = await getSettingsReadContext();
  if (!readCtx.canRead) {
    return NextResponse.json({ error: "Insufficient role for settings read." }, { status: 403 });
  }
  return NextResponse.json(buildPublicConfig(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request) {
  const ctx = await getSettingsWriteContext();
  if (!ctx.canWrite) {
    return NextResponse.json({ error: "Insufficient role for turnitin settings write." }, { status: 403 });
  }
  const prev = readTurnitinConfig().config;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const next = writeTurnitinConfig({
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    qaOnly: typeof body.qaOnly === "boolean" ? body.qaOnly : undefined,
    autoSendOnExtract: typeof body.autoSendOnExtract === "boolean" ? body.autoSendOnExtract : undefined,
    autoDetectAiWritingOnGrade:
      typeof body.autoDetectAiWritingOnGrade === "boolean"
        ? body.autoDetectAiWritingOnGrade
        : undefined,
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    clearApiKey: body.clearApiKey === true,
    ownerUserId: typeof body.ownerUserId === "string" ? body.ownerUserId : undefined,
    viewerUserId: typeof body.viewerUserId === "string" ? body.viewerUserId : undefined,
    locale: typeof body.locale === "string" ? body.locale : undefined,
    integrationName: typeof body.integrationName === "string" ? body.integrationName : undefined,
    integrationVersion: typeof body.integrationVersion === "string" ? body.integrationVersion : undefined,
  });

  appendSettingsAuditEvent({
    actor: await getCurrentAuditActor(),
    role: ctx.role,
    action: "TURNITIN_CONFIG_UPDATED",
    target: "turnitin-config",
    changes: {
      enabledFrom: prev.enabled,
      enabledTo: next.enabled,
      qaOnlyFrom: prev.qaOnly,
      qaOnlyTo: next.qaOnly,
      autoSendOnExtractFrom: prev.autoSendOnExtract,
      autoSendOnExtractTo: next.autoSendOnExtract,
      autoDetectAiWritingOnGradeFrom: prev.autoDetectAiWritingOnGrade,
      autoDetectAiWritingOnGradeTo: next.autoDetectAiWritingOnGrade,
      baseUrlFrom: prev.baseUrl,
      baseUrlTo: next.baseUrl,
      ownerUserIdFrom: prev.ownerUserId || null,
      ownerUserIdTo: next.ownerUserId || null,
      viewerUserIdFrom: prev.viewerUserId || null,
      viewerUserIdTo: next.viewerUserId || null,
      localeFrom: prev.locale,
      localeTo: next.locale,
      integrationNameFrom: prev.integrationName,
      integrationNameTo: next.integrationName,
      integrationVersionFrom: prev.integrationVersion,
      integrationVersionTo: next.integrationVersion,
      apiKeyChanged: typeof body.apiKey === "string" || body.clearApiKey === true,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      config: buildPublicConfig(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
