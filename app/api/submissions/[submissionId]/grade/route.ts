import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { readGradingConfig } from "@/lib/grading/config";
import { createMarkedPdf } from "@/lib/grading/markedPdf";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { validateGradeDecision } from "@/lib/grading/decisionValidation";
import { buildStructuredGradingV2 } from "@/lib/grading/assessmentResult";
import { evaluateExtractionReadiness } from "@/lib/grading/extractionQualityGate";
import { extractFirstNameForFeedback, personalizeFeedbackSummary } from "@/lib/grading/feedbackPersonalization";
import { renderFeedbackTemplate } from "@/lib/grading/feedbackDocument";
import { buildPageNotesFromCriterionChecks } from "@/lib/grading/pageNotes";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";
import { fetchOpenAiJson, resolveOpenAiApiKey } from "@/lib/openai/client";

export const runtime = "nodejs";

type BriefTaskLike = {
  n?: number | string;
  label?: string;
  text?: string;
  parts?: Array<{ key?: string; text?: string }>;
};

type AssessmentRequirement = {
  task: string;
  section: string;
  needsTable: boolean;
  needsPercentage: boolean;
  charts: string[];
  needsEquation: boolean;
  needsImage: boolean;
};

type SubmissionAssessmentEvidence = {
  hasTableWords?: boolean;
  hasBarWords?: boolean;
  hasPieWords?: boolean;
  hasFigureWords?: boolean;
  hasImageWords?: boolean;
  hasEquationTokenWords?: boolean;
  hasEqMarker?: boolean;
  equationLikeLineCount?: number;
  percentageCount?: number;
  dataRowLikeCount?: number;
};

function normalizeText(value: unknown) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractAssessmentRequirementsFromBrief(briefDocExtractedJson: any): AssessmentRequirement[] {
  const tasks = Array.isArray(briefDocExtractedJson?.tasks) ? (briefDocExtractedJson.tasks as BriefTaskLike[]) : [];
  if (!tasks.length) return [];

  const out: AssessmentRequirement[] = [];
  for (const task of tasks) {
    const taskLabel = String(task?.label || (task?.n ? `Task ${task.n}` : "Task")).trim();
    const parts = Array.isArray(task?.parts) ? task.parts : [];

    const sections = new Map<string, string[]>();
    let currentSection = "";
    for (const part of parts) {
      const key = String(part?.key || "").trim().toLowerCase();
      const txt = normalizeText(part?.text);
      if (!key || !txt) continue;
      const letter = key.match(/^[a-z]$/)?.[0] || key.match(/^([a-z])\./)?.[1] || null;
      if (letter) currentSection = letter;
      const bucket = letter || currentSection || "task";
      if (!sections.has(bucket)) sections.set(bucket, []);
      sections.get(bucket)!.push(txt);
    }

    if (!sections.size) {
      const body = normalizeText(task?.text);
      if (body) sections.set("task", [body]);
    }

    for (const [section, chunks] of sections.entries()) {
      const body = normalizeText(chunks.join("\n"));
      const lower = body.toLowerCase();
      const charts: string[] = [];
      if (/\bbar\s+(chart|graph)\b/.test(lower)) charts.push("bar");
      if (/\bpie\s+(chart|graph)\b/.test(lower)) charts.push("pie");
      if (/\bline\s+(chart|graph)\b/.test(lower)) charts.push("line");
      if (/\bscatter\b/.test(lower)) charts.push("scatter");
      if (/\bhistogram\b/.test(lower)) charts.push("histogram");
      const needsTable = /\btable\b/.test(lower);
      const needsPercentage = /\bpercentage\b|%/.test(lower);
      const needsEquation =
        /\[\[eq:[^\]]+\]\]/i.test(body) ||
        /\b(equation|formula|express(ed|ion)|using\s+.*equation|solve\s+for|derive)\b/i.test(body);
      const needsImage =
        /\[\[img:[^\]]+\]\]/i.test(body) ||
        /\b(image|diagram|figure|graph\s+below|shown\s+below|circuit|screenshot)\b/i.test(body);

      if (!charts.length && !needsTable && !needsPercentage && !needsEquation && !needsImage) continue;
      out.push({
        task: taskLabel,
        section,
        needsTable,
        needsPercentage,
        charts,
        needsEquation,
        needsImage,
      });
    }
  }
  return out;
}

function summarizeAssessmentRequirements(requirements: AssessmentRequirement[]): string {
  if (!requirements.length) return "No explicit chart/table/image/equation requirements detected from brief tasks.";
  return requirements
    .slice(0, 16)
    .map((r) => {
      const items: string[] = [];
      if (r.needsTable) items.push("table");
      if (r.needsPercentage) items.push("percentages");
      if (r.charts.length) items.push(`${r.charts.join("+")} chart`);
      if (r.needsImage) items.push("image/diagram evidence");
      if (r.needsEquation) items.push("equation/formula evidence");
      const section = r.section === "task" ? "" : ` part ${r.section}`;
      return `- ${r.task}${section}: ${items.join(", ") || "modality evidence required"}`;
    })
    .join("\n");
}

function detectSubmissionAssessmentEvidence(text: string) {
  const src = normalizeText(text).toLowerCase();
  const hasTableWords = /\btable\b|\btabulated\b/.test(src);
  const hasBarWords = /\bbar\s+(chart|graph)\b/.test(src);
  const hasPieWords = /\bpie\s+(chart|graph)\b/.test(src);
  const hasFigureWords = /\bfigure\b|\bgraph\b|\bchart\b/.test(src);
  const hasImageWords = /\b(image|diagram|figure|circuit|screenshot)\b/.test(src);
  const hasEquationTokenWords = /\b(equation|formula)\b/.test(src);
  const hasEqMarker = /\[\[eq:[^\]]+\]\]/i.test(src);
  const equationLikeLineCount =
    src.match(/(?:^|\n)\s*[a-z][a-z0-9_]{0,10}\s*=\s*[^,\n]{2,80}/g)?.length || 0;
  const percentageCount = src.match(/\b\d+(?:\.\d+)?\s*%/g)?.length || 0;
  const dataRowLikeMatches = src.match(/\b[a-z][a-z\s]{2,30}\s+\d{1,4}(?:\.\d+)?%?\b/g) || [];
  return {
    hasTableWords,
    hasBarWords,
    hasPieWords,
    hasFigureWords,
    hasImageWords,
    hasEquationTokenWords,
    hasEqMarker,
    equationLikeLineCount: Math.min(120, equationLikeLineCount),
    percentageCount: Math.min(200, percentageCount),
    dataRowLikeCount: Math.min(80, dataRowLikeMatches.length),
  };
}

function evaluateModalityCompliance(
  requirements: AssessmentRequirement[],
  evidence: SubmissionAssessmentEvidence
) {
  const found = {
    table: Boolean(evidence.hasTableWords) || Number(evidence.dataRowLikeCount || 0) >= 2,
    bar: Boolean(evidence.hasBarWords),
    pie: Boolean(evidence.hasPieWords),
    graph: Boolean(evidence.hasFigureWords),
    image: Boolean(evidence.hasImageWords) || Boolean(evidence.hasFigureWords),
    equation:
      Boolean(evidence.hasEqMarker) ||
      Boolean(evidence.hasEquationTokenWords) ||
      Number(evidence.equationLikeLineCount || 0) > 0,
    percentage: Number(evidence.percentageCount || 0) > 0,
  };

  const rows = requirements.map((r) => {
    const charts = Array.isArray(r.charts) ? r.charts.map((c) => String(c || "").toLowerCase()) : [];
    const chartRequired = charts.length > 0;
    const chartFound = !chartRequired
      ? true
      : charts.every((c) => (c === "bar" ? found.bar : c === "pie" ? found.pie : found.graph));
    const tableFound = !r.needsTable || found.table;
    const equationFound = !r.needsEquation || found.equation;
    const imageFound = !r.needsImage || found.image;
    const percentageFound = !r.needsPercentage || found.percentage;
    const ok = chartFound && tableFound && equationFound && imageFound && percentageFound;
    return {
      task: r.task,
      section: r.section,
      ok,
      missing: {
        chart: chartRequired && !chartFound,
        table: !!r.needsTable && !tableFound,
        equation: !!r.needsEquation && !equationFound,
        image: !!r.needsImage && !imageFound,
        percentage: !!r.needsPercentage && !percentageFound,
      },
    };
  });

  const failedRows = rows.filter((r) => !r.ok);
  return {
    found,
    rows,
    missingCount: failedRows.length,
    missingSummary: failedRows.slice(0, 12).map((r) => ({
      task: r.task,
      section: r.section,
      ...r.missing,
    })),
  };
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

  const outputText = extractOutputText(responseJson);
  return parseModelJson(outputText);
}

function buildPageSampleContext(pages: Array<{ pageNumber: number; text: string }>, maxCharsPerPage: number, maxPages: number) {
  const selected = (Array.isArray(pages) ? pages : [])
    .slice(0, Math.max(1, maxPages))
    .map((p) => ({
      pageNumber: Number(p.pageNumber || 0),
      text: normalizeText(String(p.text || "")).slice(0, Math.max(200, maxCharsPerPage)),
    }))
    .filter((p) => p.pageNumber > 0 && p.text.length > 0);

  if (!selected.length) return "(No page samples available.)";
  return selected.map((p) => `Page ${p.pageNumber}\n${p.text}`).join("\n\n---\n\n");
}

function toUkDate(iso?: string | Date | null) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("en-GB");
  return d.toLocaleDateString("en-GB");
}

function normalizeAssignmentRef(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const canonical = raw.match(/^A\s*([1-9]\d?)$/i);
  if (canonical) return `A${canonical[1]}`;
  const labeled = raw.match(/\b(?:Assignment|A)\s*([1-9]\d?)\b/i);
  if (labeled) return `A${labeled[1]}`;
  const bare = raw.match(/\b([1-9]\d?)\b/);
  if (bare) return `A${bare[1]}`;
  return null;
}

function extractCoverAssignmentSignals(sourceMeta: any) {
  const cover = sourceMeta?.coverMetadata || {};
  const unitCodeRaw = String(cover?.unitCode?.value || "").trim();
  const assignmentRaw = String(cover?.assignmentCode?.value || "").trim();
  const unitCode = unitCodeRaw.match(/\b(4\d{3})\b/)?.[1] || null;
  const assignmentRef = normalizeAssignmentRef(assignmentRaw);
  return { unitCode, assignmentRef };
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const requestId = makeRequestId();
  const gradingStartedAt = new Date();
  const { submissionId } = await ctx.params;
  if (!submissionId) {
    return apiError({
      status: 400,
      code: "GRADE_MISSING_SUBMISSION_ID",
      userMessage: "Missing submission id.",
      route: "/api/submissions/[submissionId]/grade",
      requestId,
    });
  }

  const body = (await req.json().catch(() => ({}))) as {
    tone?: string;
    strictness?: string;
    useRubricIfAvailable?: boolean;
  };
  const actor = await getCurrentAuditActor();

  const { apiKey } = resolveOpenAiApiKey("preferStandard");
  if (!apiKey) {
    return apiError({
      status: 500,
      code: "GRADE_OPENAI_KEY_MISSING",
      userMessage: "OpenAI API key is not configured.",
      route: "/api/submissions/[submissionId]/grade",
      requestId,
    });
  }

  const submissionInclude = {
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
    extractionRuns: {
      orderBy: { startedAt: "desc" as const },
      take: 1,
      select: {
        id: true,
        status: true,
        overallConfidence: true,
        pageCount: true,
        warnings: true,
        sourceMeta: true,
      },
    },
  } as const;

  let submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: submissionInclude,
  });
  if (!submission) {
    return apiError({
      status: 404,
      code: "GRADE_SUBMISSION_NOT_FOUND",
      userMessage: "Submission not found.",
      route: "/api/submissions/[submissionId]/grade",
      requestId,
      details: { submissionId },
    });
  }
  const extractionGate = evaluateExtractionReadiness({
    submissionStatus: submission.status,
    extractedText: submission.extractedText,
    latestRun: submission.extractionRuns?.[0] || null,
  });
  if (!extractionGate.ok) {
    return apiError({
      status: 422,
      code: "GRADE_EXTRACTION_NOT_READY",
      userMessage: "Extraction quality gate failed. Review extraction/OCR before grading.",
      route: "/api/submissions/[submissionId]/grade",
      requestId,
      details: {
        submissionId,
        blockers: extractionGate.blockers,
        warnings: extractionGate.warnings,
        metrics: extractionGate.metrics,
      },
    });
  }

  // Recovery path: if triage linked a placeholder assignment (or missed assignment link),
  // attempt to resolve to a mapped brief by unitCode + assignmentRef before failing.
  let relinked = false;
  const coverSignals = extractCoverAssignmentSignals(submission.extractionRuns?.[0]?.sourceMeta);

  if (!submission.assignment && coverSignals.unitCode && coverSignals.assignmentRef) {
    const preferred = await prisma.assignment.findFirst({
      where: {
        unitCode: coverSignals.unitCode,
        assignmentRef: coverSignals.assignmentRef,
        assignmentBriefId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    const fallback =
      preferred ||
      (await prisma.assignment.findFirst({
        where: {
          unitCode: coverSignals.unitCode,
          assignmentRef: coverSignals.assignmentRef,
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      }));
    if (fallback?.id) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { assignmentId: fallback.id },
      });
      relinked = true;
    }
  }

  if (submission.assignment && !submission.assignment.assignmentBrief) {
    const unitCode = String(submission.assignment.unitCode || "").trim() || coverSignals.unitCode;
    const assignmentRef = normalizeAssignmentRef(submission.assignment.assignmentRef) || coverSignals.assignmentRef;
    if (unitCode && assignmentRef) {
      const candidates = await prisma.assignmentBrief.findMany({
        where: {
          unit: { unitCode },
          assignmentCode: assignmentRef,
        },
        select: { id: true },
        take: 2,
      });
      if (candidates.length === 1) {
        await prisma.assignment.update({
          where: { id: submission.assignment.id },
          data: { assignmentBriefId: candidates[0].id },
        });
        relinked = true;
      }
    }
  }

  if (relinked) {
    submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: submissionInclude,
    });
  }

  if (!submission.assignment || !submission.assignment.assignmentBrief) {
    const missingUnitCode = submission.assignment?.unitCode || coverSignals.unitCode || null;
    const missingAssignmentRef =
      normalizeAssignmentRef(submission.assignment?.assignmentRef) || coverSignals.assignmentRef || null;
    return apiError({
      status: 422,
      code: "GRADE_ASSIGNMENT_BINDING_MISSING",
      userMessage: `No mapped assignment brief found for ${missingUnitCode || "unknown unit"} ${missingAssignmentRef || "unknown assignment"}. Map this in Admin > Bindings.`,
      route: "/api/submissions/[submissionId]/grade",
      requestId,
      details: {
        submissionId,
        assignmentId: submission.assignment?.id || null,
        unitCode: missingUnitCode,
        assignmentRef: missingAssignmentRef,
      },
    });
  }

  const brief = submission.assignment.assignmentBrief;
  if (!brief.lockedAt) {
    return apiError({
      status: 422,
      code: "GRADE_BRIEF_NOT_LOCKED",
      userMessage: "Assignment brief is not locked. Lock references before grading.",
      route: "/api/submissions/[submissionId]/grade",
      requestId,
      details: { submissionId, briefId: brief.id },
    });
  }
  if (!brief.unit?.lockedAt) {
    return apiError({
      status: 422,
      code: "GRADE_SPEC_NOT_LOCKED",
      userMessage: "Unit spec is not locked. Lock references before grading.",
      route: "/api/submissions/[submissionId]/grade",
      requestId,
      details: { submissionId, unitId: brief.unit?.id },
    });
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
  const criteriaCodes = Array.from(new Set(criteria.map((c) => String(c.code || "").trim().toUpperCase()).filter(Boolean)));

  const rubricAttachment = (brief.briefDocument?.sourceMeta as any)?.rubricAttachment || null;
  const rubricHint = useRubric && rubricAttachment ? `Rubric attached: ${String(rubricAttachment.originalFilename || "yes")}` : "No rubric attachment used.";
  const assessmentRequirements = extractAssessmentRequirementsFromBrief(brief.briefDocument?.extractedJson);
  const assessmentRequirementsText = summarizeAssessmentRequirements(assessmentRequirements);
  const latestRunMeta = (submission.extractionRuns?.[0]?.sourceMeta as any) || {};
  const coverMetadata = latestRunMeta?.coverMetadata || null;
  const studentFirstName = extractFirstNameForFeedback({
    studentFullName: submission?.student?.fullName || null,
    coverStudentName: coverMetadata?.studentName?.value || null,
  });
  const extractionMode = String(latestRunMeta?.extractionMode || "").toUpperCase();
  const coverReady = Boolean(latestRunMeta?.coverReady);
  const latestRunId = String(submission.extractionRuns?.[0]?.id || "");
  const sampledPages =
    latestRunId
      ? await prisma.extractedPage.findMany({
          where: { extractionRunId: latestRunId },
          orderBy: { pageNumber: "asc" },
          take: Math.max(1, Math.min(6, Number(process.env.OPENAI_GRADE_PAGE_SAMPLE_COUNT || 4))),
          select: { pageNumber: true, text: true },
        })
      : [];
  const pageContext = buildPageSampleContext(
    sampledPages,
    Math.max(500, Math.min(6000, Number(process.env.OPENAI_GRADE_PAGE_SAMPLE_CHAR_LIMIT || 1600))),
    Math.max(1, Math.min(6, Number(process.env.OPENAI_GRADE_PAGE_SAMPLE_COUNT || 4)))
  );
  const sampledPageText = sampledPages
    .map((p) => normalizeText(p.text))
    .filter(Boolean)
    .join("\n\n");
  const modalityEvidenceText = [String(submission.extractedText || ""), sampledPageText].filter(Boolean).join("\n\n");
  const modalityEvidenceSource = "BODY_PLUS_PAGE_SAMPLES";
  const inputCharLimit = Math.max(4000, Math.min(120000, Number(process.env.OPENAI_GRADE_INPUT_CHAR_LIMIT || 18000)));
  const configuredMaxOutputTokens = Math.max(500, Math.min(4000, Number(process.env.OPENAI_GRADE_MAX_OUTPUT_TOKENS || 1100)));
  const criteriaDrivenMinOutputTokens = Math.max(900, Math.min(3800, 500 + criteriaCodes.length * 140));
  const maxOutputTokens = Math.max(configuredMaxOutputTokens, criteriaDrivenMinOutputTokens);
  const bodyFallbackText =
    String(submission.extractedText || "").slice(0, inputCharLimit) ||
    "(No substantial extracted body text available. Use evidence-based caution.)";
  const submissionAssessmentEvidence = detectSubmissionAssessmentEvidence(modalityEvidenceText);
  const modalityCompliance = evaluateModalityCompliance(assessmentRequirements, submissionAssessmentEvidence);

  const prompt = [
    "You are an engineering assignment assessor.",
    `Tone: ${tone}. Strictness: ${strictness}.`,
    "Grade using only these grades: REFER, PASS, PASS_ON_RESUBMISSION, MERIT, DISTINCTION.",
    "Return STRICT JSON with keys:",
    "{ overallGradeWord, resubmissionRequired, feedbackSummary, feedbackBullets[], criterionChecks:[{code, decision, rationale, confidence, evidence:[{page, quote?, visualDescription?}]}], confidence }",
    "Rules:",
    "- Include one criterionChecks item for every criteria code provided.",
    "- code must exactly match the provided criteria code.",
    "- ACHIEVED is only valid with page-linked evidence.",
    "- evidence must include at least one item with numeric page and either quote or visualDescription.",
    "- decision must be one of: ACHIEVED, NOT_ACHIEVED, UNCLEAR.",
    "- If the brief requires tables/charts/images/equations, explicitly evaluate whether the submission includes them with usable evidence and reference that in evidence/comments.",
    "- Missing required charts/images/equations/tables must reduce criterion attainment and overall grade confidence.",
    "",
    "Assignment context:",
    `Unit: ${brief.unit.unitCode} ${brief.unit.unitTitle}`,
    `Assignment code: ${brief.assignmentCode}`,
    `Feedback addressee first name: ${studentFirstName || "Unknown (infer if possible)"}`,
    rubricHint,
    "",
    "Detected modality requirements from assignment brief (chart/table/image/equation):",
    assessmentRequirementsText,
    "",
    "Submission modality evidence hints (heuristic):",
    JSON.stringify(submissionAssessmentEvidence, null, 2),
    "",
    "Submission cover metadata (audit extraction):",
    JSON.stringify(coverMetadata, null, 2),
    "",
    "Criteria:",
    JSON.stringify(criteria.slice(0, 120), null, 2),
    "",
    "Student submission page samples (supporting evidence):",
    pageContext,
    "",
    "Submission extracted body text (primary context):",
    bodyFallbackText,
  ].join("\n");
  const promptHash = createHash("sha256").update(prompt).digest("hex");

  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: "ASSESSING" },
  });

  try {
    const response = await fetchOpenAiJson(
      "/v1/responses",
      apiKey,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
        model: cfg.model,
        input: prompt,
        temperature: 0.2,
        max_output_tokens: maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: "grading_result",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                overallGrade: { type: "string" },
                overallGradeWord: { type: "string" },
                resubmissionRequired: { type: "boolean" },
                feedbackSummary: { type: "string" },
                feedbackBullets: { type: "array", items: { type: "string" } },
                criterionChecks: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      code: { type: "string" },
                      decision: { type: "string" },
                      rationale: { type: "string" },
                      confidence: { type: "number" },
                      evidence: {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            page: { type: "number" },
                            quote: { type: ["string", "null"] },
                            visualDescription: { type: ["string", "null"] },
                          },
                          required: ["page", "quote", "visualDescription"],
                        },
                      },
                    },
                    required: ["code", "decision", "rationale", "confidence", "evidence"],
                  },
                },
                confidence: { type: "number" },
              },
              required: ["overallGrade", "overallGradeWord", "resubmissionRequired", "feedbackSummary", "feedbackBullets", "criterionChecks", "confidence"],
            },
          },
        },
      }),
      },
      {
        timeoutMs: Number(process.env.OPENAI_GRADE_TIMEOUT_MS || 60000),
        retries: Number(process.env.OPENAI_GRADE_RETRIES || 2),
      }
    );

    if (!response.ok) throw new Error(response.message);
    const json = response.json;

    const usage = json?.usage || null;
    if (usage) {
      recordOpenAiUsage({
        model: cfg.model,
        op: "submission_grade",
        usage,
      });
    }

    const parsed = extractStructuredModelJson(json) || {};
    const validated = validateGradeDecision(parsed, criteriaCodes);
    const decision =
      "errors" in validated
        ? {
            overallGradeWord: "REFER" as const,
            overallGrade: "REFER" as const,
            resubmissionRequired: true,
            feedbackSummary:
              "Automated grading output was invalid for this submission. This run is flagged for manual review.",
            feedbackBullets: [
              "Automated grading output failed schema validation.",
              "A conservative REFER fallback has been applied.",
              "Review criterion decisions and rerun grading after extraction/model checks.",
            ],
            criterionChecks: criteriaCodes.map((code) => ({
              code,
              decision: "UNCLEAR" as const,
              rationale: "Fallback decision: model output invalid; manual review required.",
              confidence: 0.25,
              evidence: [{ page: 1, visualDescription: "Fallback placeholder due to invalid model output." }],
            })),
            confidence: 0.25,
          }
        : validated.data;
    const achievedWithoutEvidence = decision.criterionChecks.find(
      (row) => row.decision === "ACHIEVED" && (!Array.isArray(row.evidence) || row.evidence.length === 0)
    );
    if (achievedWithoutEvidence) {
      await prisma.submission.update({
        where: { id: submission.id },
        data: { status: "FAILED" },
      });
      return apiError({
        status: 422,
        code: "GRADE_DECISION_EVIDENCE_MISSING",
        userMessage: `Criterion ${achievedWithoutEvidence.code} was marked ACHIEVED without evidence.`,
        route: "/api/submissions/[submissionId]/grade",
        requestId,
        details: { submissionId, criterionCode: achievedWithoutEvidence.code },
      });
    }

    const confidenceCap = Math.max(
      0.2,
      Math.min(0.95, Number(process.env.GRADE_MODALITY_MISSING_CONFIDENCE_CAP || 0.65))
    );
    const modelConfidenceRaw = Number(decision.confidence);
    const modelConfidence = Number.isFinite(modelConfidenceRaw)
      ? Math.max(0, Math.min(1, modelConfidenceRaw))
      : 0.5;
    const confidenceWasCapped =
      modalityCompliance.missingCount > 0 && modelConfidence > confidenceCap;
    const finalConfidence = confidenceWasCapped ? confidenceCap : modelConfidence;

    const overallGrade = decision.overallGradeWord;
    const feedbackSummary = personalizeFeedbackSummary(decision.feedbackSummary, studentFirstName);
    const feedbackBullets = decision.feedbackBullets.slice(0, cfg.maxFeedbackBullets);
    if (modalityCompliance.missingCount > 0) {
      feedbackBullets.unshift(
        `Automated review: required modality evidence missing in ${modalityCompliance.missingCount} task section(s); confidence capped at ${finalConfidence.toFixed(2)}.`
      );
    }
    if (extractionMode === "COVER_ONLY") {
      feedbackBullets.unshift("Cover-only extraction mode was active; grading relied primarily on sampled page evidence.");
    }
    const responseWithPolicy = {
      ...decision,
      confidence: finalConfidence,
    };
    const completedAtIso = new Date().toISOString();
    const structuredGradingV2 = buildStructuredGradingV2(responseWithPolicy, {
      contractVersion: "v2-structured-evidence",
      promptHash,
      model: cfg.model,
      gradedBy: actor,
      startedAtIso: gradingStartedAt.toISOString(),
      completedAtIso,
    });
    const feedbackDate = toUkDate(completedAtIso);
    const feedbackText = renderFeedbackTemplate({
      template: cfg.feedbackTemplate,
      studentFirstName: studentFirstName || "Student",
      feedbackSummary,
      feedbackBullets: feedbackBullets.length ? feedbackBullets : ["Feedback generated."],
      overallGrade,
      assessorName: actor,
      markedDate: feedbackDate,
    });
    const pageNotes = cfg.pageNotesEnabled
      ? buildPageNotesFromCriterionChecks(decision.criterionChecks, {
          maxPages: cfg.pageNotesMaxPages,
          maxLinesPerPage: cfg.pageNotesMaxLinesPerPage,
          tone: cfg.pageNotesTone,
          includeCriterionCode: cfg.pageNotesIncludeCriterionCode,
        })
      : [];

    let marked: { storagePath: string; absolutePath: string } | null = null;
    let markedPdfWarning: string | null = null;
    try {
      marked = await createMarkedPdf(submission.storagePath, {
        submissionId: submission.id,
        overallGrade,
        feedbackBullets: feedbackBullets.length ? feedbackBullets : [feedbackSummary || "Feedback generated."],
        tone,
        strictness,
        studentName: studentFirstName || submission?.student?.fullName || "Student",
        assessorName: actor,
        markedDate: feedbackDate,
        overallPlacement: "last",
        pageNotes,
      });
    } catch (markErr: any) {
      markedPdfWarning = String(markErr?.message || markErr || "Marked PDF generation failed.");
      console.error(
        JSON.stringify({
          level: "warn",
          route: "/api/submissions/[submissionId]/grade",
          requestId,
          code: "GRADE_MARKED_PDF_FAILED",
          submissionId,
          message: markedPdfWarning,
        })
      );
    }

    const assessment = await prisma.assessment.create({
      data: {
        submissionId: submission.id,
        overallGrade,
        feedbackText: feedbackText || "No feedback generated.",
        annotatedPdfPath: marked?.storagePath || null,
        resultJson: {
          requestId,
          gradingTimeline: {
            startedAt: gradingStartedAt.toISOString(),
            completedAt: completedAtIso,
          },
          gradedBy: actor,
          model: cfg.model,
          gradingContractVersion: "v2-structured-evidence",
          tone,
          strictness,
          useRubric,
          rubricAttachment,
          promptHash,
          promptChars: prompt.length,
          criteriaCount: criteria.length,
          pageSampleCount: sampledPages.length,
          extractionMode: extractionMode || "UNKNOWN",
          coverReady,
          studentFirstNameUsed: studentFirstName || null,
          feedbackTemplateUsed: cfg.feedbackTemplate,
          feedbackRenderedDate: feedbackDate,
          pageNotesGenerated: pageNotes,
          pageNotesConfigUsed: {
            enabled: cfg.pageNotesEnabled,
            tone: cfg.pageNotesTone,
            maxPages: cfg.pageNotesMaxPages,
            maxLinesPerPage: cfg.pageNotesMaxLinesPerPage,
            includeCriterionCode: cfg.pageNotesIncludeCriterionCode,
          },
          modalityEvidenceSource,
          assessmentRequirements,
          submissionAssessmentEvidence,
          modalityCompliance,
          confidencePolicy: {
            mode: "cap",
            cap: confidenceCap,
            modelConfidence,
            finalConfidence,
            wasCapped: confidenceWasCapped,
          },
          structuredGradingV2,
          response: responseWithPolicy,
          usage,
          extractionGate,
          markedPdf: {
            generated: !!marked?.storagePath,
            warning: markedPdfWarning,
          },
        } as any,
      },
    });

    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "DONE" },
    });

    return NextResponse.json(
      {
        ok: true,
        assessment: {
          id: assessment.id,
          overallGrade: assessment.overallGrade,
          feedbackText: assessment.feedbackText,
          annotatedPdfPath: assessment.annotatedPdfPath,
          createdAt: assessment.createdAt,
          gradedBy: actor,
        },
        requestId,
      },
      { headers: { "x-request-id": requestId } }
    );
  } catch (e: any) {
    const causeMessage = String(e?.message || e || "Unknown grading error").slice(0, 600);
    const isModelOutputError = /model output failed schema validation/i.test(causeMessage);
    const status = isModelOutputError ? 422 : 500;
    const code = isModelOutputError ? "GRADE_MODEL_OUTPUT_INVALID" : "GRADE_FAILED";
    const userMessage = isModelOutputError
      ? "Grading model output did not match required schema. Retry grading or adjust model/settings."
      : `Grading failed: ${causeMessage}`;
    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "FAILED" },
    });
    return apiError({
      status,
      code,
      userMessage,
      route: "/api/submissions/[submissionId]/grade",
      requestId,
      details: { submissionId, cause: causeMessage },
      cause: e,
    });
  }
}
