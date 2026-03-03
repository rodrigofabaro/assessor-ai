import { z } from "zod";
import { fetchOpenAiJson, resolveOpenAiApiKey } from "@/lib/openai/client";
import { readOpenAiModel } from "@/lib/openai/modelConfig";
import { buildResponsesTemperatureParam } from "@/lib/openai/responsesParams";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";

const reviewDraftInputSchema = z.object({
  studentName: z.string().trim().min(1).max(160),
  programmeTitle: z.string().trim().min(1).max(240),
  unitCodeTitle: z.string().trim().min(1).max(240),
  assignmentTitle: z.string().trim().min(1).max(240),
  assessorName: z.string().trim().min(1).max(160),
  internalVerifierName: z.string().trim().min(1).max(160),
  finalGrade: z.string().trim().min(1).max(48),
  keyNotes: z.string().trim().max(2000).optional().default(""),
  markedExtractedText: z.string().trim().min(1).max(60000),
  assessmentFeedbackText: z.string().trim().max(12000).optional().default(""),
  specExtractedText: z.string().trim().max(20000).optional().default(""),
});

const reviewDraftModelSchema = z.object({
  assessmentDecisionCheck: z.string().trim().min(1).max(1600),
  feedbackComplianceCheck: z.string().trim().min(1).max(1600),
  criteriaLinkingCheck: z.string().trim().min(1).max(1600),
  academicIntegrityCheck: z.string().trim().min(1).max(1600),
  generalComments: z.string().trim().min(1).max(4000),
  actionRequired: z.string().trim().min(1).max(2000),
  warnings: z.array(z.string().trim().min(1).max(240)).max(8).default([]),
  confidence: z.number().min(0).max(1),
  evidenceSnippets: z
    .array(
      z.object({
        source: z.enum(["submission", "assessment", "spec"]),
        excerpt: z.string().trim().min(1).max(500),
      })
    )
    .min(1)
    .max(12),
});

export const ivAdReviewDraftRequestSchema = reviewDraftInputSchema;
export type IvAdReviewDraftRequest = z.infer<typeof reviewDraftInputSchema>;

export const ivAdReviewDraftSchema = reviewDraftModelSchema.extend({
  provider: z.literal("openai"),
  model: z.string().trim().min(1).max(120),
});
export type IvAdReviewDraft = z.infer<typeof ivAdReviewDraftSchema>;

export type IvAdReviewDraftResult =
  | { ok: true; draft: IvAdReviewDraft }
  | { ok: false; reason: string };

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

function buildPrompt(input: IvAdReviewDraftRequest) {
  const markedText = clip(input.markedExtractedText, 30000);
  const feedbackText = clip(input.assessmentFeedbackText || "", 10000);
  const specText = clip(input.specExtractedText || "", 12000);
  const keyNotes = clip(input.keyNotes || "", 2000);

  return [
    "You are an Internal Verifier preparing a review draft for a Pearson IV - Assessment Decisions form.",
    "Return JSON only and follow the schema exactly.",
    "Write in UK English.",
    "Do not mention AI, model limits, or uncertainty boilerplate.",
    "",
    "Review goals:",
    "1) Check if grading decision aligns with available evidence.",
    "2) Check if assessor feedback is specific, criterion-linked, and actionable.",
    "3) Check if criteria linkage quality is acceptable.",
    "4) Check if there are academic integrity concerns in the available evidence.",
    "5) Provide direct comments and actions for assessor improvement.",
    "6) Provide short evidence snippets with source labels.",
    "",
    "Metadata:",
    `- Student: ${input.studentName}`,
    `- Programme: ${input.programmeTitle}`,
    `- Unit: ${input.unitCodeTitle}`,
    `- Assignment: ${input.assignmentTitle}`,
    `- Assessor: ${input.assessorName}`,
    `- Internal verifier: ${input.internalVerifierName}`,
    `- Awarded grade: ${input.finalGrade}`,
    `- Key notes: ${keyNotes || "(none)"}`,
    "",
    "Assessment feedback text:",
    feedbackText || "(none)",
    "",
    "Marked submission extracted text:",
    markedText || "(none)",
    "",
    "Spec/brief context extracted text:",
    specText || "(none)",
    "",
    "Warnings guidance:",
    "- Include warning strings only when there is a material risk or uncertainty.",
    "- Keep warnings concise and action-oriented.",
  ].join("\n");
}

export function parseIvAdReviewDraftRequest(input: unknown) {
  return reviewDraftInputSchema.safeParse(input);
}

export function parseIvAdReviewDraftModelOutput(input: unknown, model: string) {
  const parsed = reviewDraftModelSchema.safeParse(input);
  if (!parsed.success) {
    return ivAdReviewDraftSchema.safeParse(input);
  }
  return ivAdReviewDraftSchema.safeParse({
    ...parsed.data,
    provider: "openai",
    model,
  });
}

export async function runIvAdReviewDraft(input: IvAdReviewDraftRequest): Promise<IvAdReviewDraftResult> {
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
        max_output_tokens: Math.max(800, Math.min(3000, Number(process.env.OPENAI_IV_AD_MAX_OUTPUT_TOKENS || 1600))),
        text: {
          format: {
            type: "json_schema",
            name: "iv_ad_review_draft",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                assessmentDecisionCheck: { type: "string" },
                feedbackComplianceCheck: { type: "string" },
                criteriaLinkingCheck: { type: "string" },
                academicIntegrityCheck: { type: "string" },
                generalComments: { type: "string" },
                actionRequired: { type: "string" },
                warnings: { type: "array", items: { type: "string" } },
                confidence: { type: "number" },
                evidenceSnippets: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      source: { type: "string", enum: ["submission", "assessment", "spec"] },
                      excerpt: { type: "string" },
                    },
                    required: ["source", "excerpt"],
                  },
                },
              },
              required: [
                "assessmentDecisionCheck",
                "feedbackComplianceCheck",
                "criteriaLinkingCheck",
                "academicIntegrityCheck",
                "generalComments",
                "actionRequired",
                "warnings",
                "confidence",
                "evidenceSnippets",
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
  recordOpenAiUsage({ model, op: "iv_ad_review_draft", usage: response.json?.usage });

  const structured = extractStructuredModelJson(response.json);
  const parsed = parseIvAdReviewDraftModelOutput(structured, model);
  if (!parsed.success) return { ok: false, reason: "MODEL_OUTPUT_INVALID" };

  return { ok: true, draft: parsed.data };
}
