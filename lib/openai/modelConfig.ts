import fs from "node:fs";
import path from "node:path";

const FILE_PATH = path.join(process.cwd(), ".openai-model.json");
const DEFAULT_MODEL = "gpt-4.1-mini";

type ModelConfig = {
  model: string;
  updatedAt: string;
};

export function getDefaultOpenAiModel() {
  return String(process.env.OPENAI_EQUATION_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

export function readOpenAiModel() {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      return {
        model: getDefaultOpenAiModel(),
        source: "env" as const,
      };
    }
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<ModelConfig>;
    const model = String(parsed?.model || "").trim();
    if (!model) {
      return {
        model: getDefaultOpenAiModel(),
        source: "env" as const,
      };
    }
    return {
      model,
      source: "settings" as const,
    };
  } catch {
    return {
      model: getDefaultOpenAiModel(),
      source: "env" as const,
    };
  }
}

export function writeOpenAiModel(model: string) {
  const clean = String(model || "").trim();
  if (!clean) throw new Error("Model is required.");
  const payload: ModelConfig = {
    model: clean,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(FILE_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

