import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

const FILE_PATH = path.join(process.cwd(), ".openai-model.json");
const DEFAULT_MODEL = "gpt-4o-mini";

type ModelConfig = {
  model: string;
  autoCleanupApproved?: boolean;
  updatedAt: string;
};

let cachedConfig: ModelConfig | null = null;
let dbHydrationStarted = false;

export function getDefaultOpenAiModel() {
  return String(process.env.OPENAI_EQUATION_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function normalizeModelConfig(input: Partial<ModelConfig>): ModelConfig {
  const model = String(input?.model || "").trim() || getDefaultOpenAiModel();
  return {
    model,
    autoCleanupApproved: !!input?.autoCleanupApproved,
    updatedAt: String(input?.updatedAt || "").trim() || new Date().toISOString(),
  };
}

function hydrateFromDbOnce() {
  if (dbHydrationStarted) return;
  dbHydrationStarted = true;
  const dbModel = (prisma as any)?.appConfig;
  if (!dbModel || typeof dbModel.findUnique !== "function") return;

  void dbModel
    .findUnique({
      where: { id: 1 },
      select: { openaiModelConfig: true },
    })
    .then((row: any) => {
      const raw = row?.openaiModelConfig;
      if (!raw || typeof raw !== "object") return;
      cachedConfig = normalizeModelConfig(raw as Partial<ModelConfig>);
    })
    .catch(() => null);
}

export function readOpenAiModel() {
  hydrateFromDbOnce();
  if (cachedConfig) {
    return {
      model: cachedConfig.model,
      autoCleanupApproved: !!cachedConfig.autoCleanupApproved,
      source: "settings" as const,
    };
  }

  try {
    if (!fs.existsSync(FILE_PATH)) {
      return {
        model: getDefaultOpenAiModel(),
        autoCleanupApproved: false,
        source: "env" as const,
      };
    }
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = normalizeModelConfig(JSON.parse(raw) as Partial<ModelConfig>);
    cachedConfig = parsed;
    if (!parsed.model) {
      return {
        model: getDefaultOpenAiModel(),
        autoCleanupApproved: false,
        source: "env" as const,
      };
    }
    return {
      model: parsed.model,
      autoCleanupApproved: !!parsed.autoCleanupApproved,
      source: "settings" as const,
    };
  } catch {
    return {
      model: getDefaultOpenAiModel(),
      autoCleanupApproved: false,
      source: "env" as const,
    };
  }
}

export function writeOpenAiModel(model: string, options?: { autoCleanupApproved?: boolean }) {
  const clean = String(model || "").trim();
  if (!clean) throw new Error("Model is required.");
  const prev = readOpenAiModel();
  const payload = normalizeModelConfig({
    model: clean,
    autoCleanupApproved: typeof options?.autoCleanupApproved === "boolean" ? options.autoCleanupApproved : !!prev.autoCleanupApproved,
  });
  cachedConfig = payload;

  const dbModel = (prisma as any)?.appConfig;
  if (dbModel && typeof dbModel.upsert === "function") {
    void dbModel
      .upsert({
        where: { id: 1 },
        create: { id: 1, openaiModelConfig: payload },
        update: { openaiModelConfig: payload },
      })
      .catch(() => null);
  }

  fs.writeFileSync(FILE_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}
