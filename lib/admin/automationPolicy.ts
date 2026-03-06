import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

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

function readAutomationPolicyFromFile() {
  try {
    if (!fs.existsSync(FILE_PATH)) return { policy: defaultAutomationPolicy(), source: "default" as const };
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AutomationPolicy>;
    return { policy: normalize(parsed), source: "settings" as const };
  } catch {
    return { policy: defaultAutomationPolicy(), source: "default" as const };
  }
}

function writeAutomationPolicyToFile(next: AutomationPolicy) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(next, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function readAutomationPolicy() {
  const dbModel = (prisma as any)?.appConfig;
  if (dbModel && typeof dbModel.findUnique === "function") {
    try {
      const row = await dbModel.findUnique({
        where: { id: 1 },
        select: { automationPolicy: true },
      });
      const raw = row?.automationPolicy;
      if (raw && typeof raw === "object") {
        return { policy: normalize(raw as Partial<AutomationPolicy>), source: "settings" as const };
      }
    } catch {
      // fallback to legacy file path
    }
  }

  return readAutomationPolicyFromFile();
}

export async function writeAutomationPolicy(next: Partial<AutomationPolicy>) {
  const merged = normalize({ ...(await readAutomationPolicy()).policy, ...next });

  const dbModel = (prisma as any)?.appConfig;
  if (dbModel && typeof dbModel.upsert === "function") {
    try {
      await dbModel.upsert({
        where: { id: 1 },
        create: { id: 1, automationPolicy: merged },
        update: { automationPolicy: merged },
      });
      writeAutomationPolicyToFile(merged);
      return merged;
    } catch {
      // fallback to legacy file path below
    }
  }

  writeAutomationPolicyToFile(merged);
  return merged;
}
