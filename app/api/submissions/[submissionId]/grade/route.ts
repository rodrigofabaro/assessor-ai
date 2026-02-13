import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readGradingConfig } from "@/lib/grading/config";
import { createMarkedPdf } from "@/lib/grading/markedPdf";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";

export const runtime = "nodejs";

function getApiKey() {
  return String(
    process.env.OPENAI_API_KEY ||
      process.env.OPENAI_ADMIN_KEY ||
      process.env.OPENAI_ADMIN_API_KEY ||
      process.env.OPENAI_ADMIN ||
      ""
  )
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function toJsonResponseError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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

function normalizeGrade(raw: unknown): string {
  const s = String(raw || "").trim().toUpperCase();
  if (["PASS", "MERIT", "DISTINCTION", "REFER"].includes(s)) return s;
  return "REFER";
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await ctx.params;
  if (!submissionId) return toJsonResponseError("Missing submission id.");

  const body = (await req.json().catch(() => ({}))) as {
    tone?: string;
    strictness?: string;
    useRubricIfAvailable?: boolean;
  };

  const apiKey = getApiKey();
  if (!apiKey) return toJsonResponseError("OPENAI_API_KEY is not configured.", 500);

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: {
        include: {
          assignmentBrief: {
            include: {
              unit: {
                include: {
                  learningOutcomes: {
                    include: { criteria: true },
                  },
                },
              },
              briefDocument: true,
              criteriaMaps: {
                include: {
                  assessmentCriterion: {
                    include: { learningOutcome: true },
                  },
                },
              },
            },
          },
        },
      },
      student: true,
    },
  });
  if (!submission) return toJsonResponseError("Submission not found.", 404);
  if (!submission.extractedText || submission.extractedText.trim().length < 100) {
    return toJsonResponseError("Submission extraction is missing or too short. Run extraction first.", 422);
  }
  if (!submission.assignment || !submission.assignment.assignmentBrief) {
    return toJsonResponseError("Submission is not linked to a mapped assignment brief.", 422);
  }

  const brief = submission.assignment.assignmentBrief;
  if (!brief.lockedAt) {
    return toJsonResponseError("Assignment brief is not locked. Lock references before grading.", 422);
  }
  if (!brief.unit?.lockedAt) {
    return toJsonResponseError("Unit spec is not locked. Lock references before grading.", 422);
  }

  const cfg = readGradingConfig().config;
  const tone = String(body.tone || cfg.tone || "professional");
  const strictness = String(body.strictness || cfg.strictness || "balanced");
  const useRubric = typeof body.useRubricIfAvailable === "boolean" ? body.useRubricIfAvailable : cfg.useRubricIfAvailable;

  const criteriaFromMap = brief.criteriaMaps.map((m) => ({
    code: m.assessmentCriterion.acCode,
    band: m.assessmentCriterion.gradeBand,
    lo: m.assessmentCriterion.learningOutcome?.loCode || "",
    description: m.assessmentCriterion.description,
  }));

  const criteria =
    criteriaFromMap.length > 0
      ? criteriaFromMap
      : brief.unit.learningOutcomes.flatMap((lo) =>
          lo.criteria.map((c) => ({
            code: c.acCode,
            band: c.gradeBand,
            lo: lo.loCode,
            description: c.description,
          }))
        );

  const rubricAttachment = (brief.briefDocument?.sourceMeta as any)?.rubricAttachment || null;
  const rubricHint = useRubric && rubricAttachment ? `Rubric attached: ${String(rubricAttachment.originalFilename || "yes")}` : "No rubric attachment used.";

  const prompt = [
    "You are an engineering assignment assessor.",
    `Tone: ${tone}. Strictness: ${strictness}.`,
    "Grade using only these grades: PASS, MERIT, DISTINCTION, REFER.",
    "Return STRICT JSON with keys:",
    "{ overallGrade, feedbackSummary, feedbackBullets[], criterionChecks:[{code, met, comment}], confidence }",
    "",
    "Assignment context:",
    `Unit: ${brief.unit.unitCode} ${brief.unit.unitTitle}`,
    `Assignment code: ${brief.assignmentCode}`,
    rubricHint,
    "",
    "Criteria:",
    JSON.stringify(criteria.slice(0, 120), null, 2),
    "",
    "Student submission extracted text:",
    submission.extractedText.slice(0, 28000),
  ].join("\n");

  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: "ASSESSING" },
  });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        input: prompt,
        temperature: 0.2,
        max_output_tokens: 1400,
        text: {
          format: {
            type: "json_schema",
            name: "grading_result",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                overallGrade: { type: "string" },
                feedbackSummary: { type: "string" },
                feedbackBullets: { type: "array", items: { type: "string" } },
                criterionChecks: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      code: { type: "string" },
                      met: { type: "boolean" },
                      comment: { type: "string" },
                    },
                    required: ["code", "met", "comment"],
                  },
                },
                confidence: { type: "number" },
              },
              required: ["overallGrade", "feedbackSummary", "feedbackBullets", "criterionChecks", "confidence"],
            },
          },
        },
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(json?.error?.message || `OpenAI error (${response.status})`);
      throw new Error(message);
    }

    const usage = json?.usage || null;
    if (usage) {
      recordOpenAiUsage({
        model: cfg.model,
        op: "submission_grade",
        usage,
      });
    }

    const outputText = extractOutputText(json);
    const parsed = parseModelJson(outputText) || {};
    const overallGrade = normalizeGrade(parsed?.overallGrade);
    const feedbackSummary = String(parsed?.feedbackSummary || "").trim();
    const feedbackBulletsRaw = Array.isArray(parsed?.feedbackBullets) ? parsed.feedbackBullets : [];
    const feedbackBullets = feedbackBulletsRaw.map((x: any) => String(x || "").trim()).filter(Boolean).slice(0, cfg.maxFeedbackBullets);
    const feedbackText = [feedbackSummary, ...feedbackBullets.map((b: string) => `- ${b}`)].filter(Boolean).join("\n");

    const marked = await createMarkedPdf(submission.storagePath, {
      submissionId: submission.id,
      overallGrade,
      feedbackBullets: feedbackBullets.length ? feedbackBullets : [feedbackSummary || "Feedback generated."],
      tone,
      strictness,
    });

    const assessment = await prisma.assessment.create({
      data: {
        submissionId: submission.id,
        overallGrade,
        feedbackText: feedbackText || "No feedback generated.",
        annotatedPdfPath: marked.storagePath,
        resultJson: {
          model: cfg.model,
          tone,
          strictness,
          useRubric,
          rubricAttachment,
          criteriaCount: criteria.length,
          response: parsed,
          usage,
        } as any,
      },
    });

    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "DONE" },
    });

    return NextResponse.json({
      ok: true,
      assessment: {
        id: assessment.id,
        overallGrade: assessment.overallGrade,
        feedbackText: assessment.feedbackText,
        annotatedPdfPath: assessment.annotatedPdfPath,
        createdAt: assessment.createdAt,
      },
    });
  } catch (e: any) {
    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "FAILED" },
    });
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
