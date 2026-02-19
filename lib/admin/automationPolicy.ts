import fs from "node:fs";
import path from "node:path";

export type AutomationProviderMode = "openai" | "local" | "hybrid";

export type AutomationPolicy = {
  enabled: boolean;
  providerMode: AutomationProviderMode;
  allowBatchGrading: boolean;
  requireOperationReason: boolean;
  updatedAt: string;
};

const FILE_PATH = path.join(process.cwd(), ".automation-policy.json");

export function defaultAutomationPolicy(): AutomationPolicy {
  return {
    enabled: true,
    providerMode: "hybrid",
    allowBatchGrading: true,
    requireOperationReason: false,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeProviderMode(value: unknown): AutomationProviderMode {
  const v = String(value || "").trim().toLowerCase();
  if (v === "openai" || v === "local" || v === "hybrid") return v;
  return "hybrid";
}

function normalize(input: Partial<AutomationPolicy>): AutomationPolicy {
  const base = defaultAutomationPolicy();
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : base.enabled,
    providerMode: normalizeProviderMode(input.providerMode ?? base.providerMode),
    allowBatchGrading:
      typeof input.allowBatchGrading === "boolean" ? input.allowBatchGrading : base.allowBatchGrading,
    requireOperationReason:
      typeof input.requireOperationReason === "boolean"
        ? input.requireOperationReason
        : base.requireOperationReason,
    updatedAt: new Date().toISOString(),
  };
}

export function readAutomationPolicy() {
  try {
    if (!fs.existsSync(FILE_PATH)) return { policy: defaultAutomationPolicy(), source: "default" as const };
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AutomationPolicy>;
    return { policy: normalize(parsed), source: "settings" as const };
  } catch {
    return { policy: defaultAutomationPolicy(), source: "default" as const };
  }
}

export function writeAutomationPolicy(next: Partial<AutomationPolicy>) {
  const merged = normalize({ ...readAutomationPolicy().policy, ...next });
  fs.writeFileSync(FILE_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}
