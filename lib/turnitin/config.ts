import fs from "node:fs";
import path from "node:path";

export type TurnitinConfig = {
  enabled: boolean;
  qaOnly: boolean;
  autoSendOnExtract: boolean;
  autoDetectAiWritingOnGrade: boolean;
  baseUrl: string;
  apiKey: string;
  ownerUserId: string;
  viewerUserId: string;
  locale: string;
  integrationName: string;
  integrationVersion: string;
  updatedAt: string;
};

export type TurnitinConfigSource = "default" | "settings";

export type ResolvedTurnitinConfig = TurnitinConfig & {
  apiKeySource: "settings" | "TURNITIN_API_KEY" | "TURNITIN_TCA_API_KEY" | "TII_API_KEY" | "missing";
};

const FILE_PATH = path.join(process.cwd(), ".turnitin-config.json");

function normalizeBaseUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "https://unicourse201.turnitin.com";
  return raw.replace(/\/+$/, "").replace(/\/api\/v1$/i, "").replace(/\/api$/i, "");
}

function normalizeLocale(value: unknown) {
  const v = String(value || "").trim();
  return v || "en-US";
}

export function defaultTurnitinConfig(): TurnitinConfig {
  return {
    enabled: false,
    qaOnly: true,
    autoSendOnExtract: false,
    autoDetectAiWritingOnGrade: false,
    baseUrl: normalizeBaseUrl(process.env.TURNITIN_API_BASE_URL || process.env.TURNITIN_BASE_URL),
    apiKey: "",
    ownerUserId: "",
    viewerUserId: "",
    locale: "en-US",
    integrationName: "assessor-ai",
    integrationVersion: "1.0.0",
    updatedAt: new Date().toISOString(),
  };
}

function normalize(input: Partial<TurnitinConfig>): TurnitinConfig {
  const base = defaultTurnitinConfig();
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : base.enabled,
    qaOnly: typeof input.qaOnly === "boolean" ? input.qaOnly : base.qaOnly,
    autoSendOnExtract:
      typeof input.autoSendOnExtract === "boolean" ? input.autoSendOnExtract : base.autoSendOnExtract,
    autoDetectAiWritingOnGrade:
      typeof input.autoDetectAiWritingOnGrade === "boolean"
        ? input.autoDetectAiWritingOnGrade
        : base.autoDetectAiWritingOnGrade,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? base.baseUrl),
    apiKey: String(input.apiKey || "").trim(),
    ownerUserId: String(input.ownerUserId || "").trim(),
    viewerUserId: String(input.viewerUserId || "").trim(),
    locale: normalizeLocale(input.locale ?? base.locale),
    integrationName: String(input.integrationName || base.integrationName).trim() || base.integrationName,
    integrationVersion:
      String(input.integrationVersion || base.integrationVersion).trim() || base.integrationVersion,
    updatedAt: new Date().toISOString(),
  };
}

export function readTurnitinConfig(): { config: TurnitinConfig; source: TurnitinConfigSource } {
  try {
    if (!fs.existsSync(FILE_PATH)) return { config: defaultTurnitinConfig(), source: "default" };
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<TurnitinConfig>;
    return { config: normalize(parsed), source: "settings" };
  } catch {
    return { config: defaultTurnitinConfig(), source: "default" };
  }
}

export function writeTurnitinConfig(
  next: Partial<TurnitinConfig> & { clearApiKey?: boolean }
): TurnitinConfig {
  const current = readTurnitinConfig().config;
  const incomingKey = typeof next.apiKey === "string" ? next.apiKey.trim() : undefined;
  const merged = normalize({
    ...current,
    ...next,
    apiKey: next.clearApiKey ? "" : incomingKey !== undefined ? (incomingKey || current.apiKey) : current.apiKey,
  });
  fs.writeFileSync(FILE_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

export function resolveTurnitinRuntimeConfig(): ResolvedTurnitinConfig {
  const loaded = readTurnitinConfig().config;
  const envCandidates: Array<{ key: ResolvedTurnitinConfig["apiKeySource"]; value: string }> = [
    { key: "TURNITIN_API_KEY", value: String(process.env.TURNITIN_API_KEY || "").trim() },
    { key: "TURNITIN_TCA_API_KEY", value: String(process.env.TURNITIN_TCA_API_KEY || "").trim() },
    { key: "TII_API_KEY", value: String(process.env.TII_API_KEY || "").trim() },
  ];
  const envHit = envCandidates.find((entry) => !!entry.value);
  const settingsKey = String(loaded.apiKey || "").trim();
  const apiKey = settingsKey || envHit?.value || "";
  const apiKeySource: ResolvedTurnitinConfig["apiKeySource"] = settingsKey
    ? "settings"
    : envHit?.key || "missing";

  const baseUrl = normalizeBaseUrl(
    loaded.baseUrl || process.env.TURNITIN_API_BASE_URL || process.env.TURNITIN_BASE_URL
  );
  return {
    ...loaded,
    baseUrl,
    apiKey,
    apiKeySource,
  };
}

export function maskApiKey(value: string) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length <= 8) return `${"*".repeat(Math.max(0, key.length - 2))}${key.slice(-2)}`;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
