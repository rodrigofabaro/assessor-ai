import { NextResponse } from "next/server";
import { getSettingsReadContext } from "@/lib/admin/settingsPermissions";
import { TurnitinApiError, getTurnitinFeatures } from "@/lib/turnitin/client";
import { resolveTurnitinRuntimeConfig } from "@/lib/turnitin/config";

export const runtime = "nodejs";

function parseErrorMessage(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "Unknown error";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const m1 = String(parsed.message || "").trim();
    if (m1) return m1;
    const m2 = String(parsed.debug_message || "").trim();
    if (m2) return m2;
  } catch {
    // ignore JSON parse errors and fall through to raw text
  }
  return text.replace(/\s+/g, " ").slice(0, 300);
}

function buildConfigWarnings(cfg: ReturnType<typeof resolveTurnitinRuntimeConfig>) {
  const warnings: string[] = [];
  const ownerUserId = String(cfg.ownerUserId || "").trim();
  const viewerUserId = String(cfg.viewerUserId || "").trim();
  if (cfg.enabled && !ownerUserId && !viewerUserId) {
    warnings.push("Turnitin owner or viewer user id is missing. Submission actions will fail.");
  } else if (cfg.enabled && !ownerUserId) {
    warnings.push("Turnitin owner user id is missing. Send/re-send actions can fail.");
  }
  if (cfg.enabled && !viewerUserId) {
    warnings.push("Turnitin viewer user id is missing. Report link generation is disabled.");
  }
  return warnings;
}

export async function GET() {
  const readCtx = await getSettingsReadContext();
  if (!readCtx.canRead) {
    return NextResponse.json({ error: "Insufficient role for settings read." }, { status: 403 });
  }

  const cfg = resolveTurnitinRuntimeConfig();
  const warnings = buildConfigWarnings(cfg);
  if (!cfg.apiKey) {
    return NextResponse.json(
      {
        configured: false,
        connected: false,
        status: 0,
        message: "Turnitin API key is missing. Set it in Admin Settings or environment.",
        enabled: cfg.enabled,
        warnings,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const features = await getTurnitinFeatures(cfg);

    return NextResponse.json(
      {
        configured: true,
        connected: true,
        status: 200,
        message: "Connected to Turnitin features endpoint.",
        enabled: cfg.enabled,
        qaOnly: cfg.qaOnly,
        keySource: cfg.apiKeySource,
        baseUrl: cfg.baseUrl,
        warnings,
        features,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const status = error instanceof TurnitinApiError ? error.status : 0;
    const message =
      error instanceof TurnitinApiError
        ? parseErrorMessage(error.message)
        : parseErrorMessage(String((error as Error)?.message || error));
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        status,
        message,
        enabled: cfg.enabled,
        qaOnly: cfg.qaOnly,
        keySource: cfg.apiKeySource,
        baseUrl: cfg.baseUrl,
        warnings,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
