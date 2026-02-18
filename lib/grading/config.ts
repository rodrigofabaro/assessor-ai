import fs from "node:fs";
import path from "node:path";
import { readOpenAiModel } from "@/lib/openai/modelConfig";
import { getDefaultFeedbackTemplate } from "@/lib/grading/feedbackDocument";

const FILE_PATH = path.join(process.cwd(), ".grading-config.json");

export type GradingTone = "supportive" | "professional" | "strict";
export type GradingStrictness = "lenient" | "balanced" | "strict";

export type GradingConfig = {
  model: string;
  tone: GradingTone;
  strictness: GradingStrictness;
  useRubricIfAvailable: boolean;
  maxFeedbackBullets: number;
  feedbackTemplate: string;
  pageNotesEnabled: boolean;
  pageNotesTone: GradingTone;
  pageNotesMaxPages: number;
  pageNotesMaxLinesPerPage: number;
  pageNotesIncludeCriterionCode: boolean;
  updatedAt: string;
};

export function defaultGradingConfig(): GradingConfig {
  const baseModel = readOpenAiModel().model || "gpt-4.1-mini";
  return {
    model: baseModel,
    tone: "professional",
    strictness: "balanced",
    useRubricIfAvailable: true,
    maxFeedbackBullets: 6,
    feedbackTemplate: getDefaultFeedbackTemplate(),
    pageNotesEnabled: true,
    pageNotesTone: "professional",
    pageNotesMaxPages: 6,
    pageNotesMaxLinesPerPage: 3,
    pageNotesIncludeCriterionCode: true,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTone(v: unknown): GradingTone {
  const x = String(v || "").trim().toLowerCase();
  if (x === "supportive" || x === "strict") return x;
  return "professional";
}

function normalizeStrictness(v: unknown): GradingStrictness {
  const x = String(v || "").trim().toLowerCase();
  if (x === "lenient" || x === "strict") return x;
  return "balanced";
}

function normalizeBullets(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 6;
  return Math.max(3, Math.min(12, Math.round(n)));
}

function normalizeSmallInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeModel(v: unknown): string {
  const model = String(v || "").trim();
  return model || readOpenAiModel().model || "gpt-4.1-mini";
}

function normalizeTemplate(v: unknown): string {
  const value = String(v || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return value || getDefaultFeedbackTemplate();
}

function normalizeConfig(input: Partial<GradingConfig>): GradingConfig {
  const base = defaultGradingConfig();
  return {
    model: normalizeModel(input.model ?? base.model),
    tone: normalizeTone(input.tone ?? base.tone),
    strictness: normalizeStrictness(input.strictness ?? base.strictness),
    useRubricIfAvailable:
      typeof input.useRubricIfAvailable === "boolean"
        ? input.useRubricIfAvailable
        : base.useRubricIfAvailable,
    maxFeedbackBullets: normalizeBullets(input.maxFeedbackBullets ?? base.maxFeedbackBullets),
    feedbackTemplate: normalizeTemplate(input.feedbackTemplate ?? base.feedbackTemplate),
    pageNotesEnabled:
      typeof input.pageNotesEnabled === "boolean" ? input.pageNotesEnabled : base.pageNotesEnabled,
    pageNotesTone: normalizeTone(input.pageNotesTone ?? base.pageNotesTone),
    pageNotesMaxPages: normalizeSmallInt(input.pageNotesMaxPages, base.pageNotesMaxPages, 1, 20),
    pageNotesMaxLinesPerPage: normalizeSmallInt(
      input.pageNotesMaxLinesPerPage,
      base.pageNotesMaxLinesPerPage,
      1,
      8
    ),
    pageNotesIncludeCriterionCode:
      typeof input.pageNotesIncludeCriterionCode === "boolean"
        ? input.pageNotesIncludeCriterionCode
        : base.pageNotesIncludeCriterionCode,
    updatedAt: new Date().toISOString(),
  };
}

export function readGradingConfig() {
  try {
    if (!fs.existsSync(FILE_PATH)) return { config: defaultGradingConfig(), source: "default" as const };
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<GradingConfig>;
    return { config: normalizeConfig(parsed), source: "settings" as const };
  } catch {
    return { config: defaultGradingConfig(), source: "default" as const };
  }
}

export function writeGradingConfig(next: Partial<GradingConfig>) {
  const merged = normalizeConfig({ ...readGradingConfig().config, ...next });
  fs.writeFileSync(FILE_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}
