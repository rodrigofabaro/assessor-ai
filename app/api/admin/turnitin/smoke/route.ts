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

export async function GET() {
  const readCtx = await getSettingsReadContext();
  if (!readCtx.canRead) {
    return NextResponse.json({ error: "Insufficient role for settings read." }, { status: 403 });
  }

  const cfg = resolveTurnitinRuntimeConfig();
  if (!cfg.apiKey) {
    return NextResponse.json(
      {
        configured: false,
        connected: false,
        status: 0,
        message: "Turnitin API key is missing. Set it in Admin Settings or environment.",
        enabled: cfg.enabled,
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
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
