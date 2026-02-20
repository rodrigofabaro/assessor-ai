import { NextResponse } from "next/server";
import { getSettingsReadContext } from "@/lib/admin/settingsPermissions";

export const runtime = "nodejs";

type TurnitinConfig = {
  apiKey: string;
  keySource: string;
  baseUrl: string;
  endpoint: string;
};

function resolveTurnitinConfig(): TurnitinConfig | null {
  const keys: Array<{ name: string; value: string }> = [
    { name: "TURNITIN_API_KEY", value: String(process.env.TURNITIN_API_KEY || "").trim() },
    { name: "TURNITIN_TCA_API_KEY", value: String(process.env.TURNITIN_TCA_API_KEY || "").trim() },
    { name: "TII_API_KEY", value: String(process.env.TII_API_KEY || "").trim() },
  ];
  const selected = keys.find((k) => !!k.value);
  if (!selected) return null;

  const rawBase =
    String(process.env.TURNITIN_API_BASE_URL || "").trim() ||
    String(process.env.TURNITIN_BASE_URL || "").trim();
  const normalizedBase = rawBase
    ? rawBase.replace(/\/+$/, "").replace(/\/api\/v1$/i, "").replace(/\/api$/i, "")
    : "https://unicourse201.turnitin.com";
  const endpoint = `${normalizedBase}/api/v1/features-enabled`;

  return {
    apiKey: selected.value,
    keySource: selected.name,
    baseUrl: normalizedBase,
    endpoint,
  };
}

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

  const cfg = resolveTurnitinConfig();
  if (!cfg) {
    return NextResponse.json(
      {
        configured: false,
        connected: false,
        status: 0,
        message: "Turnitin API key is missing. Set TURNITIN_API_KEY (or TURNITIN_TCA_API_KEY).",
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const res = await fetch(cfg.endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "X-Turnitin-Integration-Name": "assessor-ai-smoke",
        "X-Turnitin-Integration-Version": "0.0.1",
      },
      cache: "no-store",
    });

    const raw = await res.text();
    const message = res.ok ? "Connected to Turnitin features endpoint." : parseErrorMessage(raw);

    return NextResponse.json(
      {
        configured: true,
        connected: res.ok,
        status: res.status,
        message,
        keySource: cfg.keySource,
        baseUrl: cfg.baseUrl,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        status: 0,
        message: parseErrorMessage(String((error as Error)?.message || error)),
        keySource: cfg.keySource,
        baseUrl: cfg.baseUrl,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
