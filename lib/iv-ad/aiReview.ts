import { fetchOpenAiJson, resolveOpenAiApiKey } from "@/lib/openai/client";
import { readOpenAiModel } from "@/lib/openai/modelConfig";
import { buildResponsesTemperatureParam } from "@/lib/openai/responsesParams";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";

export type IvAdAiReview = {
  gradingDecisionVerdict: "CORRECT" | "QUESTIONABLE" | "INCORRECT";
  feedbackQualityVerdict: "STRONG" | "ADEQUATE" | "WEAK";
  confidence: number;
  summary: string;
  generalComments: string;
  actionRequired: string;
  provider: "openai";
  model: string;
};

type IvAdAiReviewInput = {
  studentName: string;
  programmeTitle: string;
  unitCodeTitle: string;
  assignmentTitle: string;
  assessorName: string;
  internalVerifierName: string;
  finalGrade: string;
  keyNotes: string;
  markedExtractedText: string;
  specExtractedText?: string | null;
};

type IvAdAiReviewResult =
  | { ok: true; review: IvAdAiReview }
  | { ok: false; reason: string };

function normalizeText(s: unknown) {
  return String(s || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function clip(s: string, max: number) {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

function extractOutputText(responseJson: any): string {
  const direct = String(responseJson?.output_text || "").trim();
  if (direct) return direct;
  const out = Array.isArray(responseJson?.output) ? responseJson.output : [];
  const parts: string[] = [];
  for (const block of out) {
    const content = Array.isArray(block?.content) ? block.content : [];
    for (const c of content) {
      const txt = String(c?.text || c?.output_text || "").trim();
      if (txt) parts.push(txt);
    }
  }
  return parts.join("\n").trim();
}

function parseModelJson(text: string) {
  const src = String(text || "").trim();
  if (!src) return null;
  try {
    return JSON.parse(src);
  } catch {
    const m = src.match(/\{[\s\S]*\}$/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function extractStructuredModelJson(responseJson: any) {
  const directParsed = responseJson?.output_parsed;
  if (directParsed && typeof directParsed === "object") return directParsed;
  const out = Array.isArray(responseJson?.output) ? responseJson.output : [];
  for (const block of out) {
    const content = Array.isArray(block?.content) ? block.content : [];
    for (const c of content) {
      if (c?.parsed && typeof c.parsed === "object") return c.parsed;
      if (c?.json && typeof c.json === "object") return c.json;
    }
  }
  return parseModelJson(extractOutputText(responseJson));
}

function sanitizeReview(input: any, model: string): IvAdAiReview | null {
  const gd = String(input?.gradingDecisionVerdict || "").toUpperCase();
  const fq = String(input?.feedbackQualityVerdict || "").toUpperCase();
  const allowedGd = new Set(["CORRECT", "QUESTIONABLE", "INCORRECT"]);
  const allowedFq = new Set(["STRONG", "ADEQUATE", "WEAK"]);
  if (!allowedGd.has(gd) || !allowedFq.has(fq)) return null;

  const confidenceRaw = Number(input?.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.5;
  const summary = normalizeText(input?.summary);
  const generalComments = normalizeText(input?.generalComments);
  const actionRequired = normalizeText(input?.actionRequired);
  if (!summary || !generalComments || !actionRequired) return null;

  return {
    gradingDecisionVerdict: gd as IvAdAiReview["gradingDecisionVerdict"],
    feedbackQualityVerdict: fq as IvAdAiReview["feedbackQualityVerdict"],
    confidence,
    summary: clip(summary, 800),
    generalComments: clip(generalComments, 4000),
    actionRequired: clip(actionRequired, 1200),
    provider: "openai",
    model,
  };
}

function buildPrompt(input: IvAdAiReviewInput) {
  const markedText = clip(normalizeText(input.markedExtractedText || ""), 28000);
  const specText = clip(normalizeText(input.specExtractedText || ""), 12000);
  const keyNotes = normalizeText(input.keyNotes || "");

  return [
    "You are an Internal Verifier reviewing assessor decisions for a Pearson-style IV Assessment Decisions form.",
    "Return strict JSON only via the schema.",
    "Write in UK English.",
    "Do not mention AI, model limitations, or uncertainty boilerplate.",
    "Use evidence from marked submission text and optional spec context.",
    "",
    "Required checks:",
    "1) Is the awarded grade aligned with observed evidence and feedback quality?",
    "2) Is the assessor feedback specific, criterion-linked, and actionable?",
    "3) Are action points concrete for the assessor?",
    "",
    "Input metadata:",
    `- Student: ${input.studentName}`,
    `- Programme: ${input.programmeTitle}`,
    `- Unit: ${input.unitCodeTitle}`,
    `- Assignment: ${input.assignmentTitle}`,
    `- Assessor: ${input.assessorName}`,
    `- Internal verifier: ${input.internalVerifierName}`,
    `- Awarded grade: ${input.finalGrade}`,
    `- Key notes: ${keyNotes || "(none)"}`,
    "",
    "Marked submission extracted text:",
    markedText || "(none)",
    "",
    "Spec/brief context extracted text (optional):",
    specText || "(none)",
  ].join("\n");
}

export async function runIvAdAiReview(input: IvAdAiReviewInput): Promise<IvAdAiReviewResult> {
  const { apiKey } = resolveOpenAiApiKey("preferStandard");
  if (!apiKey) return { ok: false, reason: "OPENAI_API_KEY_MISSING" };

  const model = String(process.env.OPENAI_IV_AD_MODEL || readOpenAiModel().model || "gpt-4o-mini").trim();
  if (!model) return { ok: false, reason: "MODEL_UNRESOLVED" };

  const prompt = buildPrompt(input);
  const response = await fetchOpenAiJson(
    "/v1/responses",
    apiKey,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        input: prompt,
        ...buildResponsesTemperatureParam(model, 0.1),
        max_output_tokens: Math.max(500, Math.min(2200, Number(process.env.OPENAI_IV_AD_MAX_OUTPUT_TOKENS || 1200))),
        text: {
          format: {
            type: "json_schema",
            name: "iv_ad_review",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                gradingDecisionVerdict: { type: "string", enum: ["CORRECT", "QUESTIONABLE", "INCORRECT"] },
                feedbackQualityVerdict: { type: "string", enum: ["STRONG", "ADEQUATE", "WEAK"] },
                confidence: { type: "number" },
                summary: { type: "string" },
                generalComments: { type: "string" },
                actionRequired: { type: "string" },
              },
              required: [
                "gradingDecisionVerdict",
                "feedbackQualityVerdict",
                "confidence",
                "summary",
                "generalComments",
                "actionRequired",
              ],
            },
          },
        },
      }),
    },
    {
      timeoutMs: Number(process.env.OPENAI_IV_AD_TIMEOUT_MS || 60000),
      retries: Number(process.env.OPENAI_IV_AD_RETRIES || 1),
    }
  );

  if (!response.ok) return { ok: false, reason: `OPENAI_FAILED:${response.message}` };
  recordOpenAiUsage({ model, op: "iv_ad_review", usage: response.json?.usage });

  const parsed = extractStructuredModelJson(response.json);
  const review = sanitizeReview(parsed, model);
  if (!review) return { ok: false, reason: "MODEL_OUTPUT_INVALID" };
  return { ok: true, review };
}

