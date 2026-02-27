import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prisma } from "@/lib/prisma";
import { readGradingConfig, resolveFeedbackTemplate } from "@/lib/grading/config";
import { createMarkedPdf } from "@/lib/grading/markedPdf";
import { recordOpenAiUsage } from "@/lib/openai/usageLog";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { validateGradeDecision } from "@/lib/grading/decisionValidation";
import { buildStructuredGradingV2 } from "@/lib/grading/assessmentResult";
import { evaluateExtractionReadiness } from "@/lib/grading/extractionQualityGate";
import { extractFirstNameForFeedback, personalizeFeedbackSummary } from "@/lib/grading/feedbackPersonalization";
import { renderFeedbackTemplate } from "@/lib/grading/feedbackDocument";
import {
  buildPageNotesFromCriterionChecks,
  pageNoteTextHasIncompleteAdvice,
  repairPageNoteTextAdvice,
  type MarkedPageNote,
} from "@/lib/grading/pageNotes";
import { resolvePageNoteBannedKeywords, type PageNoteGenerationContext } from "@/lib/grading/pageNoteSectionMaps";
import { lintOverallFeedbackClaims } from "@/lib/grading/feedbackClaimLint";
import { lintOverallFeedbackPearsonPolicy } from "@/lib/grading/feedbackPearsonPolicyLint";
import { sanitizeStudentFeedbackBullets, sanitizeStudentFeedbackLine } from "@/lib/grading/studentFeedback";
import { getOrCreateAppConfig } from "@/lib/admin/appConfig";
import { fetchOpenAiJson, resolveOpenAiApiKey } from "@/lib/openai/client";
import { readOpenAiModel } from "@/lib/openai/modelConfig";
import { buildResponsesTemperatureParam } from "@/lib/openai/responsesParams";
import { appendOpsEvent } from "@/lib/ops/eventLog";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";
import { computeGradingConfidence } from "@/lib/grading/confidenceScoring";
import { chooseGradingInputStrategy } from "@/lib/grading/inputStrategy";
import { extractFile } from "@/lib/extraction";
import { maybeAutoDetectAiWritingForSubmission } from "@/lib/turnitin/service";
import { pickTonePhrase, resolveToneProfileFromLegacy, type ToneProfile } from "@/lib/notes/toneDatabase";

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

type SubmissionComplianceCheck = {
  policyCode: string;
  status: "PASS" | "RETURN_REQUIRED";
  affectsAcademicGrade: boolean;
  checks: {
    hasZbibLink: boolean;
    hasLinkToThisVersion: boolean;
    harvardLikeReferenceCount: number;
    referencesSectionDetected: boolean;
  };
  issues: string[];
  recommendedAction: string | null;
};

type CriteriaScopePolicy = {
  policyCode: string;
  allowedCriteriaCodes: string[];
  loLabel: string;
  ignoreManualExclusions: boolean;
};

type PageNoteCriterionCheckRow = {
  code?: string;
  decision?: string;
  rationale?: string;
  comment?: string;
  evidence?: Array<{ page?: number; quote?: string | null; visualDescription?: string | null }>;
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

function isModelVerificationBlocked(message: string, model: string) {
  const m = String(message || "").toLowerCase();
  const normalizedModel = String(model || "").trim().toLowerCase();
  if (!normalizedModel.startsWith("gpt-5")) return false;
  return m.includes("organization must be verified") || m.includes("verify organization");
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

function pickBriefCriteriaCodes(briefExtractedJson: any): string[] {
  const ex = briefExtractedJson || {};
  const candidates: unknown[][] = [
    Array.isArray(ex?.criteriaCodes) ? ex.criteriaCodes : [],
    Array.isArray(ex?.criteriaRefs) ? ex.criteriaRefs : [],
    Array.isArray(ex?.detectedCriterionCodes) ? ex.detectedCriterionCodes : [],
  ];
  for (const arr of candidates) {
    const normalized: string[] = Array.from(
      new Set(
        arr
          .map((v: unknown) => String(v || "").trim().toUpperCase())
          .filter((v: string) => /^[PMD]\d{1,2}$/.test(v))
      )
    );
    if (normalized.length) return normalized;
  }
  return [];
}

function pickExcludedBriefCriteriaCodes(briefDocumentSourceMeta: any): string[] {
  const arr = Array.isArray(briefDocumentSourceMeta?.gradingCriteriaExclusions)
    ? briefDocumentSourceMeta.gradingCriteriaExclusions
    : [];
  const out = new Set<string>();
  for (const value of arr) {
    const raw = String(value || "").trim().toUpperCase();
    const m = raw.match(/^([PMD])\s*(\d{1,2})$/);
    if (!m) continue;
    out.add(`${m[1]}${Number(m[2])}`);
  }
  return Array.from(out).sort();
}

function resolveCriteriaScopePolicy(unitCode: string, assignmentCode: string): CriteriaScopePolicy | null {
  const unit = String(unitCode || "").trim();
  const assignment = String(assignmentCode || "").trim().toUpperCase();
  if (unit === "4002" && assignment === "A2") {
    return {
      policyCode: "U4002_A2_LO3_ONLY",
      allowedCriteriaCodes: ["P6", "P7", "M3", "D2"],
      loLabel: "LO3",
      ignoreManualExclusions: true,
    };
  }
  return null;
}

function compareCriteriaAlignment(mappedCodes: string[], briefCodes: string[]) {
  const mapped = Array.from(new Set((mappedCodes || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)));
  const brief = Array.from(new Set((briefCodes || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)));
  const mappedSet = new Set(mapped);
  const briefSet = new Set(brief);
  const intersection = mapped.filter((c) => briefSet.has(c));
  const missingInMap = brief.filter((c) => !mappedSet.has(c));
  const extraInMap = mapped.filter((c) => !briefSet.has(c));
  const denominator = Math.max(1, Math.max(mapped.length, brief.length));
  const overlapRatio = intersection.length / denominator;
  return {
    mapped,
    brief,
    intersection,
    missingInMap,
    extraInMap,
    mismatchCount: missingInMap.length + extraInMap.length,
    overlapRatio,
  };
}

function containsBlankContentClaim(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  return (
    /\bsubmission appears blank\b/i.test(text) ||
    /\bblank submission\b/i.test(text) ||
    /\bno readable (?:content|text|writing)\b/i.test(text) ||
    /\bno (?:usable|meaningful) content\b/i.test(text) ||
    /\bunreadable\b/i.test(text) ||
    /\bempty pages?\b/i.test(text) ||
    /\bno content across all pages\b/i.test(text)
  );
}

const FEEDBACK_DEDUP_STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "this",
  "that",
  "your",
  "their",
  "there",
  "for",
  "from",
  "into",
  "over",
  "under",
  "across",
  "about",
  "have",
  "has",
  "had",
  "was",
  "were",
  "are",
  "is",
  "been",
  "being",
  "also",
  "very",
  "more",
  "most",
  "some",
  "good",
  "clear",
  "well",
  "submission",
  "work",
  "student",
  "criteria",
  "criterion",
  "assessment",
  "evidence",
  "page",
  "pages",
  "grade",
  "final",
  "outcome",
  "reach",
  "address",
  "including",
  "especially",
  "required",
]);

function stripFeedbackLeadRepetition(value: unknown) {
  let text = sanitizeStudentFeedbackLine(String(value || "").trim());
  if (!text) return "";
  text = text
    .replace(/^\s*(?:feedback summary[^:]*|assessment summary \(criteria-referenced\)):\s*/i, "")
    .replace(
      /^\s*(?:outcome|decision|final grade)\s*:\s*(?:refer|pass(?:_on_resubmission)?|merit|distinction)\.?\s*/i,
      ""
    )
    .replace(/^\s*(?:refer|pass(?:_on_resubmission)?|merit|distinction)\.?\s*/i, "")
    .replace(/^\s*[-•]\s*/g, "")
    .trim();
  return text;
}

function feedbackThemeTokens(value: unknown) {
  const text = stripFeedbackLeadRepetition(value)
    .toLowerCase()
    .replace(/\b[pmd]\d{1,2}\b/g, " ")
    .replace(/\b(?:to\s+reach|gap\s+to\s+address|priority\s+improvements?)\b/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return [] as string[];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of text.split(" ")) {
    if (!token) continue;
    if (token.length <= 2) continue;
    if (/^\d+$/.test(token)) continue;
    if (FEEDBACK_DEDUP_STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= 24) break;
  }
  return out;
}

function feedbackTokenOverlapScore(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  let hit = 0;
  for (const token of a) {
    if (bSet.has(token)) hit += 1;
  }
  return hit / Math.max(1, Math.min(a.length, b.length));
}

function dedupeFeedbackBullets(input: { bullets: string[]; summary: string; max: number }) {
  const out: string[] = [];
  const seenExact = new Set<string>();
  const keptTokenSets: string[][] = [];
  const summaryTokens = feedbackThemeTokens(input.summary);
  const summaryCompact = stripFeedbackLeadRepetition(input.summary).toLowerCase();

  for (const raw of Array.isArray(input.bullets) ? input.bullets : []) {
    const line = sanitizeStudentFeedbackLine(raw);
    if (!line) continue;
    if (/^final grade\s*:/i.test(line)) continue;

    const exactKey = line.toLowerCase();
    if (seenExact.has(exactKey)) continue;

    const lineCompact = stripFeedbackLeadRepetition(line).toLowerCase();
    const lineTokens = feedbackThemeTokens(line);
    const hasPageRef = /\bpages?\s*\d+(?:\s*[-–]\s*\d+)?\b/i.test(line) || /\bp\.\s*\d+\b/i.test(line);

    if (
      lineTokens.length >= 6 &&
      summaryTokens.length >= 6 &&
      (feedbackTokenOverlapScore(lineTokens, summaryTokens) >= 0.8 ||
        (lineCompact.length >= 40 && summaryCompact.includes(lineCompact)))
    ) {
      if (hasPageRef) {
        // Keep evidence-trace bullets even if the theme overlaps with the summary.
      } else {
        continue;
      }
    }

    let duplicateTheme = false;
    if (lineTokens.length >= 5 && !hasPageRef) {
      for (const kept of keptTokenSets) {
        if (feedbackTokenOverlapScore(lineTokens, kept) >= 0.85) {
          duplicateTheme = true;
          break;
        }
      }
    }
    if (duplicateTheme) continue;

    seenExact.add(exactKey);
    out.push(line);
    if (lineTokens.length) keptTokenSets.push(lineTokens);
    if (out.length >= Math.max(1, input.max)) break;
  }

  return out;
}

function splitFeedbackSentences(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripLeadingStudentAddress(summary: string, firstName?: string | null) {
  let s = String(summary || "").trim();
  const name = String(firstName || "").trim();
  if (!s) return "";
  s = s.replace(/^\s*hello\s+[A-Za-z][A-Za-z' -]{0,40},?\s*/i, "");
  if (name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`^\\s*${escaped}\\s*,\\s*`, "i"), "");
  }
  return s.trim();
}

function humanizeSummarySentence(sentence: string) {
  let s = sanitizeStudentFeedbackLine(sentence).replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s
    .replace(/^The submission provides\b/i, "Your submission provides")
    .replace(/^The submission demonstrates\b/i, "Your submission demonstrates")
    .replace(/^The submission shows\b/i, "Your submission shows")
    .replace(/^The submission examines\b/i, "Your submission examines")
    .replace(/^The submission explores\b/i, "Your submission explores")
    .replace(/^The submission includes\b/i, "Your submission includes")
    .replace(/^The submission presents\b/i, "Your submission presents")
    .replace(/^The analysis extends to assessing\b/i, "You also analyse")
    .replace(/^The analysis extends to\b/i, "You also extend your analysis to")
    .replace(/^The analysis\b/i, "Your analysis")
    .replace(/^It also examines\b/i, "You also examine")
    .replace(/^It also explores\b/i, "You also explore")
    .replace(/^It also includes\b/i, "You also include")
    .replace(/^It also demonstrates\b/i, "You also demonstrate")
    .replace(/^It also assesses\b/i, "You also assess")
    .replace(/^The submission is well[- ]referenced\b/i, "Your work is well referenced")
    .replace(/\bthe submission is well[- ]referenced\b/i, "your work is well referenced")
    .replace(/\bThe submission\b/g, "Your submission")
    .replace(/\bthe submission\b/g, "your submission")
    .replace(/\bfulfilling the Pass criteria\b/i, "meeting the Pass criteria")
    .replace(/\bsuitable for Merit\b/i, "at Merit level")
    .replace(/\s+,/g, ",")
    .trim();
  return s;
}

function warmenFriendlyFeedbackSummary(input: { summary: string; overallGrade: string }) {
  const gradeBand = normalizeGradeBand(input.overallGrade);
  const cleaned = stripFeedbackLeadRepetition(input.summary);
  if (!cleaned) return "Feedback provided below.";

  const sentences = splitFeedbackSentences(cleaned).map(humanizeSummarySentence).filter(Boolean);
  let merged = sentences.join(" ").replace(/\s+/g, " ").trim();
  if (!merged) merged = cleaned;

  const hasWarmLead = /\b(?:you have done well|you have shown|you demonstrate|you show|strong work|good understanding)\b/i.test(
    merged
  );
  const hasDirectSecondPerson = /\b(?:you|your)\b/i.test(merged);

  if (!hasDirectSecondPerson) {
    merged = `You ${merged.charAt(0).toLowerCase()}${merged.slice(1)}`;
  }

  if (!hasWarmLead) {
    if (gradeBand === "DISTINCTION") merged = `You have produced a strong piece of work here. ${merged}`;
    else if (gradeBand === "MERIT") merged = `You have done well here and shown a good understanding overall. ${merged}`;
    else if (gradeBand === "PASS" || gradeBand === "PASS_ON_RESUBMISSION")
      merged = `You have made a solid start here. ${merged}`;
    else merged = `You have made a start here. ${merged}`;
  }

  return sanitizeStudentFeedbackLine(merged.replace(/\s+/g, " ").trim()) || "Feedback provided below.";
}

function formatNextBandRequirementLine(targetBand: "PASS" | "MERIT" | "DISTINCTION", missingCodes: string[]) {
  const codes = Array.isArray(missingCodes) ? missingCodes.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean) : [];
  if (!codes.length) return "";
  if (codes.length === 1) {
    return `To reach ${targetBand}, achieve ${codes[0]}.`;
  }
  if (targetBand === "DISTINCTION") {
    return `To reach DISTINCTION, all Distinction criteria must be achieved, including: ${formatCriterionCodes(codes)}.`;
  }
  if (targetBand === "MERIT") {
    return `To reach MERIT, all Merit criteria must be achieved, including: ${formatCriterionCodes(codes)}.`;
  }
  return `To achieve PASS, secure all Pass criteria, especially: ${formatCriterionCodes(codes)}.`;
}

function inferReadableSubmissionEvidence(input: {
  textCorpus: string;
  sampledPagesCount: number;
  extractedChars: number;
  rawPdfPagesUsed: number;
  submissionAssessmentEvidence: SubmissionAssessmentEvidence;
}) {
  const text = normalizeText(input.textCorpus || "");
  const mathematicalSignals =
    /\b(task|problem)\s*[1-9]\d?\b/i.test(text) ||
    /\b(sin|cos|tan|phasor|vector|determinant|amplitude|frequency|component|waveform|equation)\b/i.test(text) ||
    (/\d/.test(text) && /[=+\-*/]/.test(text));
  const equationSignals =
    Boolean(input.submissionAssessmentEvidence?.hasEqMarker) ||
    Number(input.submissionAssessmentEvidence?.equationLikeLineCount || 0) >= 2;
  const substantialText = text.length >= 500 || Number(input.extractedChars || 0) >= 1200;
  const hasMultiPageContext = Number(input.sampledPagesCount || 0) >= 2 || Number(input.rawPdfPagesUsed || 0) >= 2;
  return Boolean(mathematicalSignals || equationSignals || (substantialText && hasMultiPageContext));
}

function inferHandwritingLikely(input: {
  submissionFilename: string;
  textCorpus: string;
  isPdfSubmission: boolean;
  extractionMode: string;
  gradingInputMode: string;
  extractionConfidence: number;
  extractedChars: number;
  submissionAssessmentEvidence: SubmissionAssessmentEvidence;
}) {
  const filenameSignal = /\b(handwrit|scan|photo|camera|img)\b/i.test(String(input.submissionFilename || ""));
  const textSignal = /\b(handwritten|scanned|scan)\b/i.test(String(input.textCorpus || ""));
  const imageMode = input.gradingInputMode === "RAW_PDF_IMAGES" || input.extractionMode === "COVER_ONLY";
  const lowOcrForMathPdf =
    input.isPdfSubmission &&
    Number(input.extractionConfidence || 0) < 0.82 &&
    Number(input.extractedChars || 0) < 2600 &&
    (Boolean(input.submissionAssessmentEvidence?.hasEqMarker) ||
      Number(input.submissionAssessmentEvidence?.equationLikeLineCount || 0) >= 2);
  return Boolean(filenameSignal || textSignal || imageMode || lowOcrForMathPdf);
}

function extractCoverAssignmentSignals(sourceMeta: any) {
  const cover = sourceMeta?.coverMetadata || {};
  const unitCodeRaw = String(cover?.unitCode?.value || "").trim();
  const assignmentRaw = String(cover?.assignmentCode?.value || "").trim();
  const unitCode = unitCodeRaw.match(/\b(\d{1,4})\b/)?.[1] || null;
  const assignmentRef = normalizeAssignmentRef(assignmentRaw);
  return { unitCode, assignmentRef };
}

function normalizeGradeBand(value: unknown): "REFER" | "PASS" | "PASS_ON_RESUBMISSION" | "MERIT" | "DISTINCTION" {
  const v = String(value || "").trim().toUpperCase();
  if (v === "DISTINCTION" || v === "MERIT" || v === "PASS" || v === "PASS_ON_RESUBMISSION") return v;
  return "REFER";
}

function gradeRank(grade: unknown) {
  const g = normalizeGradeBand(grade);
  if (g === "DISTINCTION") return 4;
  if (g === "MERIT") return 3;
  if (g === "PASS") return 2;
  if (g === "PASS_ON_RESUBMISSION") return 1;
  return 0;
}

function deriveU4002A2GradeFromCriterionChecks(
  criterionChecks: Array<{ code?: string; decision?: string }>
): "REFER" | "PASS" | "MERIT" | "DISTINCTION" {
  const rows = Array.isArray(criterionChecks) ? criterionChecks : [];
  const decisionByCode = new Map<string, string>();
  for (const row of rows) {
    const code = String(row?.code || "").trim().toUpperCase();
    if (!code) continue;
    decisionByCode.set(code, String(row?.decision || "").trim().toUpperCase());
  }
  const p6 = decisionByCode.get("P6") === "ACHIEVED";
  const p7 = decisionByCode.get("P7") === "ACHIEVED";
  const m3 = decisionByCode.get("M3") === "ACHIEVED";
  const d2 = decisionByCode.get("D2") === "ACHIEVED";
  if (!p6 || !p7) return "REFER";
  if (m3 && d2) return "DISTINCTION";
  if (m3) return "MERIT";
  return "PASS";
}

function applyAssignmentGradeConsistency(input: {
  unitCode: string;
  assignmentCode: string;
  grade: "REFER" | "PASS" | "PASS_ON_RESUBMISSION" | "MERIT" | "DISTINCTION";
  criterionChecks: Array<{ code?: string; decision?: string }>;
}) {
  const unitCode = String(input.unitCode || "").trim();
  const assignmentCode = String(input.assignmentCode || "").trim().toUpperCase();
  if (!(unitCode === "4002" && assignmentCode === "A2")) {
    return {
      grade: input.grade,
      adjusted: false,
      expectedGrade: null as null | "REFER" | "PASS" | "MERIT" | "DISTINCTION",
      note: null as string | null,
    };
  }

  const expectedGrade = deriveU4002A2GradeFromCriterionChecks(input.criterionChecks);
  const adjusted = gradeRank(input.grade) < gradeRank(expectedGrade);
  return {
    grade: adjusted ? (expectedGrade as "REFER" | "PASS" | "PASS_ON_RESUBMISSION" | "MERIT" | "DISTINCTION") : input.grade,
    adjusted,
    expectedGrade,
    note: adjusted
      ? `Grade consistency rule applied (U4002 A2 LO3): raised raw grade from ${input.grade} to ${expectedGrade} to match criterion outcomes.`
      : null,
  };
}

function applyResubmissionCap(
  rawGradeInput: unknown,
  resubmissionRequired: boolean,
  capEnabled: boolean
) {
  const rawGrade = normalizeGradeBand(rawGradeInput);
  const shouldCap =
    capEnabled &&
    resubmissionRequired &&
    (rawGrade === "MERIT" || rawGrade === "DISTINCTION");
  return {
    rawGrade,
    finalGrade: shouldCap ? ("PASS_ON_RESUBMISSION" as const) : rawGrade,
    wasCapped: shouldCap,
    capReason: shouldCap ? ("CAPPED_DUE_TO_RESUBMISSION" as const) : null,
  };
}

function applyBandCompletionCap(
  rawGradeInput: unknown,
  criterionChecks: Array<{ code?: string; decision?: string }>,
  criteria: Array<{ code?: string; band?: string }>
) {
  const rawGrade = normalizeGradeBand(rawGradeInput);
  const achieved = new Set(
    (Array.isArray(criterionChecks) ? criterionChecks : [])
      .filter((row) => String(row?.decision || "").trim().toUpperCase() === "ACHIEVED")
      .map((row) => String(row?.code || "").trim().toUpperCase())
      .filter(Boolean)
  );
  const passCodes = Array.from(
    new Set(
      (Array.isArray(criteria) ? criteria : [])
        .filter((c) => String(c?.band || "").trim().toUpperCase() === "PASS")
        .map((c) => String(c?.code || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
  const meritCodes = Array.from(
    new Set(
      (Array.isArray(criteria) ? criteria : [])
        .filter((c) => String(c?.band || "").trim().toUpperCase() === "MERIT")
        .map((c) => String(c?.code || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
  const distinctionCodes = Array.from(
    new Set(
      (Array.isArray(criteria) ? criteria : [])
        .filter((c) => String(c?.band || "").trim().toUpperCase() === "DISTINCTION")
        .map((c) => String(c?.code || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
  const missingPass = passCodes.filter((code) => !achieved.has(code));
  const missingMerit = meritCodes.filter((code) => !achieved.has(code));
  const missingDistinction = distinctionCodes.filter((code) => !achieved.has(code));

  let finalGrade = rawGrade;
  let capReason: string | null = null;
  if (missingPass.length > 0) {
    finalGrade = "REFER";
    capReason = "CAPPED_DUE_TO_MISSING_PASS";
  } else if ((rawGrade === "MERIT" || rawGrade === "DISTINCTION") && missingMerit.length > 0) {
    finalGrade = "PASS";
    capReason = "CAPPED_DUE_TO_MISSING_MERIT";
  } else if (rawGrade === "DISTINCTION" && missingDistinction.length > 0) {
    finalGrade = "MERIT";
    capReason = "CAPPED_DUE_TO_MISSING_DISTINCTION";
  }
  return {
    rawGrade,
    finalGrade,
    wasCapped: finalGrade !== rawGrade,
    capReason,
    missing: {
      pass: missingPass,
      merit: missingMerit,
      distinction: missingDistinction,
    },
  };
}

function gradeBandRank(value: unknown) {
  const band = normalizeGradeBand(value);
  if (band === "REFER") return 0;
  if (band === "PASS_ON_RESUBMISSION") return 1;
  if (band === "PASS") return 2;
  if (band === "MERIT") return 3;
  if (band === "DISTINCTION") return 4;
  return 0;
}

function maxGradeBand(a: unknown, b: unknown) {
  const aBand = normalizeGradeBand(a);
  const bBand = normalizeGradeBand(b);
  return gradeBandRank(bBand) > gradeBandRank(aBand) ? bBand : aBand;
}

function deriveGradeFromCriteriaCompletion(
  criterionChecks: Array<{ code?: string; decision?: string }>,
  criteria: Array<{ code?: string; band?: string }>
) {
  const cap = applyBandCompletionCap("DISTINCTION", criterionChecks, criteria);
  if (cap.missing.pass.length > 0) return "REFER" as const;
  if (cap.missing.merit.length > 0) return "PASS" as const;
  if (cap.missing.distinction.length > 0) return "MERIT" as const;
  return "DISTINCTION" as const;
}

function normalizeDecisionLabel(value: unknown): "ACHIEVED" | "NOT_ACHIEVED" | "UNCLEAR" {
  const up = String(value || "").trim().toUpperCase();
  if (up === "ACHIEVED" || up === "NOT_ACHIEVED" || up === "UNCLEAR") return up;
  return "UNCLEAR";
}

function reasonSnippet(value: unknown, maxLen = 170) {
  const compact = sanitizeStudentFeedbackLine(String(value || "").replace(/\s+/g, " ").trim());
  if (!compact) return "";
  if (compact.length <= maxLen) return compact;
  return compact.slice(0, Math.max(40, maxLen - 1)).replace(/\s+\S*$/, "").trim();
}

function rationaleIndicatesEvidenceGap(rationale: unknown) {
  const src = normalizeText(rationale).toLowerCase();
  if (!src) return false;
  const negativeSignals = [
    /\bnot\s+(?:fully\s+)?(?:met|achieved|demonstrated|evidenced|clear|sufficient|adequate)\b/i,
    /\binsufficient(?:ly)?\b/i,
    /\blacks?\b/i,
    /\bmissing\b/i,
    /\bdoes\s+not\b/i,
    /\bfails?\s+to\b/i,
    /\bnot\s+sufficient(?:ly)?\b/i,
    /\bnot\s+clearly\b/i,
    /\bunclear\b/i,
    /\blimited\b/i,
    /\bnot\s+enough\b/i,
  ];
  const positiveSignals = [
    /\bfully\s+met\b/i,
    /\bwell\s+evidenced\b/i,
    /\bclearly\s+demonstrat(?:ed|es|ing)\b/i,
    /\bstrong\s+evidence\b/i,
    /\bmeets\s+the\s+requirement\b/i,
  ];
  const negativeCount = negativeSignals.reduce((sum, pattern) => sum + (pattern.test(src) ? 1 : 0), 0);
  const positiveCount = positiveSignals.reduce((sum, pattern) => sum + (pattern.test(src) ? 1 : 0), 0);
  return negativeCount > 0 && negativeCount >= positiveCount + 1;
}

function evaluateU4002A2D2SoftwareConfirmationEvidence(row: any) {
  const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
  const rationale = normalizeText(`${String(row?.rationale || row?.comment || "")}`);
  const comparisonSignal =
    /\b(match(?:es|ed)?|verif(?:y|ies|ied)|confirm(?:s|ed)?|agrees?|consistent|equals?|same as|software gives|overlap(?:s|ped)?|align(?:s|ed)?|correspond(?:s|ed)?)\b/i;
  const markerSignal = /\b(cursor|marker|readout|annotat(?:e|ed|ion)|label(?:led)? point)\b/i;
  const valueSignal = /\d|(?:\bt\s*=)|\b(amplitude|phase|component|result|value|current|voltage|vector|endpoint)\b/i;
  const analyticalSignal = /\b(analytic(?:al)?|calculat(?:ed|ion)|computed?|derived?|solve[sd]?|equation)\b/i;
  const softwareSignal =
    /\b(graph software|geogebra|desmos|matlab|excel|graphing calculator|software output|simulation|plot)\b/i;

  const uniqueEvidencePages = new Set<number>();
  const taskMentions = new Set<string>();
  let qualifiedEvidenceCount = 0;
  let softwareEvidenceCount = 0;
  for (const ev of evidence) {
    const page = Number(ev?.page);
    if (Number.isInteger(page) && page > 0) uniqueEvidencePages.add(page);
    const text = normalizeText(`${String(ev?.quote || "")} ${String(ev?.visualDescription || "")}`);
    if (!text) continue;
    for (const m of text.matchAll(/\b(?:task|problem)\s*([1-9]\d?)\b/gi)) {
      if (m?.[1]) taskMentions.add(String(m[1]));
    }
    if (softwareSignal.test(text)) softwareEvidenceCount += 1;
    if ((comparisonSignal.test(text) || markerSignal.test(text)) && valueSignal.test(text)) {
      qualifiedEvidenceCount += 1;
    }
  }
  for (const m of rationale.matchAll(/\b(?:task|problem)\s*([1-9]\d?)\b/gi)) {
    if (m?.[1]) taskMentions.add(String(m[1]));
  }

  const evidenceScopeCount = Math.max(taskMentions.size, uniqueEvidencePages.size, qualifiedEvidenceCount);
  const hasAnalyticalComparisonLanguage =
    (analyticalSignal.test(rationale) && comparisonSignal.test(rationale)) ||
    (comparisonSignal.test(rationale) && valueSignal.test(rationale));
  const hasSoftwareContext = softwareSignal.test(rationale) || softwareEvidenceCount > 0;
  const hasExplicitConfirmation = qualifiedEvidenceCount >= 2 || (qualifiedEvidenceCount >= 1 && hasAnalyticalComparisonLanguage);
  const ok =
    hasSoftwareContext &&
    evidenceScopeCount >= 3 &&
    hasExplicitConfirmation;

  return {
    ok,
    evidenceScopeCount,
    qualifiedEvidenceCount,
    softwareEvidenceCount,
    hasAnalyticalComparisonLanguage,
    hasSoftwareContext,
  };
}

function evaluateU4002A2M3GraphicalEvidence(row: any) {
  const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
  const rationale = normalizeText(`${String(row?.rationale || row?.comment || "")}`);
  const graphSignal = /\b(graph|plot|waveform|figure|chart|diagram|geogebra|software output|screenshot|overlay)\b/i;
  const comparisonSignal = /\b(show|illustrat(?:e|ed|es|ing)|display|label|axis|amplitude|phase|equivalen|overlap)\b/i;
  const combineSignal =
    /\b(compound angle|combined wave|single wave|coefficient matching|identity|sin\(|cos\(|amplitude[- ]phase)\b/i;
  let graphEvidenceCount = 0;
  let combineEvidenceCount = 0;
  for (const ev of evidence) {
    const text = normalizeText(`${String(ev?.quote || "")} ${String(ev?.visualDescription || "")}`);
    if (!text) continue;
    if (graphSignal.test(text) && comparisonSignal.test(text)) {
      graphEvidenceCount += 1;
    }
    if (combineSignal.test(text)) combineEvidenceCount += 1;
  }
  const corpus = `${rationale} ${evidence.map((ev: any) => `${String(ev?.quote || "")} ${String(ev?.visualDescription || "")}`).join(" ")}`;
  const hasGraphicalRationale = graphSignal.test(rationale) || /\b(illustrat(?:e|ed|es|ing)|overlap|equivalent)\b/i.test(rationale);
  const hasCombineMethodEvidence = combineSignal.test(corpus) || combineEvidenceCount > 0;
  const ok = graphEvidenceCount >= 1 && hasCombineMethodEvidence;
  return {
    ok,
    graphEvidenceCount,
    hasGraphicalRationale,
    hasCombineMethodEvidence,
  };
}

function assessSubmissionCompliancePolicy(input: {
  unitCode: string;
  assignmentCode: string;
  textCorpus: string;
}): SubmissionComplianceCheck | null {
  const unitCode = String(input.unitCode || "").trim();
  const assignmentCode = String(input.assignmentCode || "").trim().toUpperCase();
  if (!(unitCode === "4002" && assignmentCode === "A2")) return null;

  const textCorpus = normalizeText(input.textCorpus || "");
  const hasZbibLink = /\bzbib(?:\.org)?\b/i.test(textCorpus);
  const hasLinkToThisVersion = /\blink to this version\b/i.test(textCorpus);
  const referencesSectionDetected = /(?:^|\n)\s*references?\b/i.test(textCorpus);
  const harvardLikeReferenceCount =
    textCorpus.match(/\b[A-Z][A-Za-z'`-]+,\s*[A-Z](?:\.[A-Z])*\.?\s*\((?:19|20)\d{2}[a-z]?\)/g)?.length || 0;

  const issues: string[] = [];
  if (!hasZbibLink) issues.push("Missing zbib reference link.");
  if (!hasLinkToThisVersion) issues.push("Missing 'link to this version' reference evidence.");
  if (harvardLikeReferenceCount < 2) issues.push("References are not clearly Harvard formatted.");
  if (!referencesSectionDetected) issues.push("References section was not detected.");

  const status = issues.length > 0 ? ("RETURN_REQUIRED" as const) : ("PASS" as const);
  return {
    policyCode: "U4002_A2_REFERENCING",
    status,
    affectsAcademicGrade: false,
    checks: {
      hasZbibLink,
      hasLinkToThisVersion,
      harvardLikeReferenceCount,
      referencesSectionDetected,
    },
    issues,
    recommendedAction:
      status === "RETURN_REQUIRED"
        ? "Return for submission compliance update: include zbib Harvard references and provide a link to this version."
        : null,
  };
}

function extractCriterionRowsFromAssessmentResult(resultJson: any) {
  const r = resultJson && typeof resultJson === "object" ? resultJson : {};
  const fromResponse = Array.isArray(r?.response?.criterionChecks) ? r.response.criterionChecks : null;
  const fromStructured = Array.isArray(r?.structuredGradingV2?.criterionChecks) ? r.structuredGradingV2.criterionChecks : null;
  const rows = fromResponse || fromStructured || [];
  return Array.isArray(rows) ? rows : [];
}

function extractAssessorOverridesFromAssessmentResult(resultJson: any) {
  const rows = Array.isArray(resultJson?.assessorCriterionOverrides) ? resultJson.assessorCriterionOverrides : [];
  return rows
    .map((row: any) => ({
      code: String(row?.code || "").trim().toUpperCase(),
      modelDecision: normalizeDecisionLabel(row?.modelDecision),
      finalDecision: normalizeDecisionLabel(row?.finalDecision),
      reasonCode: String(row?.reasonCode || "").trim().toUpperCase(),
      note: normalizeText(row?.note),
      updatedAt: String(row?.updatedAt || "").trim() || new Date().toISOString(),
      updatedBy: String(row?.updatedBy || "").trim() || "Assessor",
    }))
    .filter(
      (row: any) =>
        /^[PMD]\d{1,2}$/.test(row.code) &&
        row.finalDecision !== "UNCLEAR" &&
        /^[A-Z_]+$/.test(row.reasonCode)
    );
}

function applyCarriedAssessorOverridesToCriterionChecks(
  criterionChecks: any[],
  overrides: Array<{
    code: string;
    modelDecision: "ACHIEVED" | "NOT_ACHIEVED" | "UNCLEAR";
    finalDecision: "ACHIEVED" | "NOT_ACHIEVED" | "UNCLEAR";
    reasonCode: string;
    note: string;
    updatedAt: string;
    updatedBy: string;
  }>
) {
  const overrideMap = new Map(overrides.map((row) => [row.code, row]));
  const appliedCodes: string[] = [];
  const rows = (Array.isArray(criterionChecks) ? criterionChecks : []).map((raw) => {
    const row = { ...(raw || {}) };
    const code = String(row?.code || "").trim().toUpperCase();
    const applied = overrideMap.get(code);
    if (!applied) return row;
    row.decision = applied.finalDecision;
    row.assessorOverride = {
      applied: true,
      modelDecision: applied.modelDecision,
      finalDecision: applied.finalDecision,
      reasonCode: applied.reasonCode,
      note: applied.note || null,
      updatedAt: applied.updatedAt,
      updatedBy: applied.updatedBy,
      carriedForward: true,
    };
    appliedCodes.push(code);
    return row;
  });
  const overrideRows = Array.from(new Set(appliedCodes))
    .map((code) => overrideMap.get(code))
    .filter(Boolean)
    .sort((a: any, b: any) => String(a.code).localeCompare(String(b.code)));
  return {
    rows,
    overrideRows,
    appliedCount: overrideRows.length,
    appliedCodes: overrideRows.map((row: any) => row.code),
  };
}

function compareCriterionDecisionDiff(
  previousRows: any[],
  nextRows: any[]
) {
  const prevMap = new Map<string, string>();
  const nextMap = new Map<string, string>();
  for (const row of Array.isArray(previousRows) ? previousRows : []) {
    const code = String(row?.code || "").trim().toUpperCase();
    if (!code) continue;
    prevMap.set(code, normalizeDecisionLabel(row?.decision));
  }
  for (const row of Array.isArray(nextRows) ? nextRows : []) {
    const code = String(row?.code || "").trim().toUpperCase();
    if (!code) continue;
    nextMap.set(code, normalizeDecisionLabel(row?.decision));
  }
  const codes = Array.from(new Set([...prevMap.keys(), ...nextMap.keys()])).sort((a, b) => a.localeCompare(b));
  const decisionRank: Record<string, number> = { NOT_ACHIEVED: 0, UNCLEAR: 1, ACHIEVED: 2 };
  const changes: Array<{ code: string; from: string; to: string; direction: "stricter" | "lenient" | "lateral" }> = [];
  let stricterCount = 0;
  let lenientCount = 0;
  let lateralCount = 0;

  for (const code of codes) {
    const from = prevMap.get(code) || "UNCLEAR";
    const to = nextMap.get(code) || "UNCLEAR";
    if (from === to) continue;
    const fromRank = Number(decisionRank[from] ?? 1);
    const toRank = Number(decisionRank[to] ?? 1);
    const direction = toRank < fromRank ? "stricter" : toRank > fromRank ? "lenient" : "lateral";
    if (direction === "stricter") stricterCount += 1;
    else if (direction === "lenient") lenientCount += 1;
    else lateralCount += 1;
    changes.push({ code, from, to, direction });
  }

  return {
    comparedCount: codes.length,
    changedCount: changes.length,
    stricterCount,
    lenientCount,
    lateralCount,
    changedCodes: changes.map((c) => c.code),
    changes: changes.slice(0, 30),
  };
}

function enforceCrossBriefCriterionDecisionGuards(input: { rows: any[] }) {
  const enabled = !["0", "false", "no", "off"].includes(
    String(process.env.GRADE_GLOBAL_CONTRADICTION_GUARD_ENABLED || "true").toLowerCase()
  );
  if (!enabled) {
    return { rows: Array.isArray(input.rows) ? [...input.rows] : [], adjustedCount: 0, adjustedCodes: [] as string[] };
  }

  const rows = Array.isArray(input.rows) ? [...input.rows] : [];
  const adjustedCodes: string[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = { ...(rows[i] || {}) };
    const decision = normalizeDecisionLabel(row?.decision);
    if (decision !== "ACHIEVED") continue;
    const rationale = String(row?.rationale || row?.comment || "").trim();
    if (!rationaleIndicatesEvidenceGap(rationale)) continue;
    row.decision = "NOT_ACHIEVED";
    row.confidence = Math.min(Number(row?.confidence || 0.55), 0.45);
    const hint = reasonSnippet(rationale, 140);
    row.rationale = sanitizeStudentFeedbackLine(
      hint
        ? `This requirement is not yet achieved because evidence is incomplete or unclear: ${hint}`
        : "This requirement is not yet achieved because evidence is incomplete or unclear."
    );
    rows[i] = row;
    const code = String(row?.code || "").trim().toUpperCase();
    if (code) adjustedCodes.push(code);
  }
  return {
    rows,
    adjustedCount: adjustedCodes.length,
    adjustedCodes: Array.from(new Set(adjustedCodes)).sort((a, b) => a.localeCompare(b)),
  };
}

function enforceBriefCriterionDecisionGuards(input: {
  unitCode: string;
  assignmentCode: string;
  decision: any;
}) {
  const notes: string[] = [];
  const next = input?.decision && typeof input.decision === "object" ? { ...input.decision } : {};
  let rows = Array.isArray(next.criterionChecks) ? [...next.criterionChecks] : [];
  const unitCode = String(input.unitCode || "").trim();
  const assignmentCode = String(input.assignmentCode || "").trim().toUpperCase();

  const skipCrossBriefGuardForAssignment = unitCode === "4002" && assignmentCode === "A2";
  if (!skipCrossBriefGuardForAssignment) {
    const crossBriefGuard = enforceCrossBriefCriterionDecisionGuards({ rows });
    rows = crossBriefGuard.rows;
    if (crossBriefGuard.adjustedCount > 0) {
      notes.push(
        `Decision guard applied: ${crossBriefGuard.adjustedCount} criterion decision(s) were downgraded because rationale language indicated evidence gaps (${crossBriefGuard.adjustedCodes.join(", ")}).`
      );
    }
  }

  // Brief-specific guard: U4004 A1 M2 must evidence an alternative milestone monitoring method
  // with explicit justification; otherwise treat as not achieved.
  if (unitCode === "4004" && assignmentCode === "A1") {
    const idx = rows.findIndex((row: any) => String(row?.code || "").trim().toUpperCase() === "M2");
    if (idx >= 0) {
      const row = { ...(rows[idx] || {}) };
      const rowDecision = String(row?.decision || "").trim().toUpperCase();
      if (rowDecision === "ACHIEVED") {
        const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
        const evidenceText = evidence
          .map((ev: any) => `${String(ev?.quote || "")} ${String(ev?.visualDescription || "")}`.trim())
          .filter(Boolean)
          .join(" ");
        const corpus = normalizeText(`${String(row?.rationale || row?.comment || "")} ${evidenceText}`).toLowerCase();
        const hasAlternativeMethod =
          /\b(design structure matrix|dsm|program evaluation and review technique|pert|work breakdown structure|wbs|kanban|alternative method|alternative monitoring)\b/i.test(
            corpus
          );
        const hasJustification = /\b(justif|rationale|because|reason|compar|versus|vs\.?)\b/i.test(corpus);
        if (!hasAlternativeMethod || !hasJustification) {
          row.decision = "NOT_ACHIEVED";
          row.confidence = Math.min(Number(row?.confidence || 0.55), 0.45);
          row.rationale = sanitizeStudentFeedbackLine(
            "M2 not achieved: evidence does not clearly demonstrate an alternative milestone monitoring method (beyond Gantt) with explicit justified selection."
          );
          rows[idx] = row;
          notes.push(
            "Decision guard applied: U4004 A1 M2 requires explicit alternative milestone monitoring method evidence plus justification."
          );
        }
      }
    }
  }

  // Brief-specific guard: U4002 A2 D2 requires explicit software confirmation against
  // analytical values for at least three problems (not screenshots alone),
  // and M3 must include graphical illustration evidence.
  if (unitCode === "4002" && assignmentCode === "A2") {
    const m3Idx = rows.findIndex((row: any) => String(row?.code || "").trim().toUpperCase() === "M3");
    if (m3Idx >= 0) {
      const row = { ...(rows[m3Idx] || {}) };
      const rowDecision = String(row?.decision || "").trim().toUpperCase();
      if (rowDecision === "ACHIEVED") {
        const m3Check = evaluateU4002A2M3GraphicalEvidence(row);
        if (!m3Check.ok) {
          row.decision = "NOT_ACHIEVED";
          row.confidence = Math.min(Number(row?.confidence || 0.55), 0.45);
          row.rationale = sanitizeStudentFeedbackLine(
            "M3 not achieved: graphical illustration evidence is missing or not explicit. Add the required graph/plot and explain how it supports the combined-angle result."
          );
          rows[m3Idx] = row;
          notes.push(
            `Decision guard applied: U4002 A2 M3 requires explicit graphical evidence (qualified graph evidence ${m3Check.graphEvidenceCount}).`
          );
        }
      }
    }

    const idx = rows.findIndex((row: any) => String(row?.code || "").trim().toUpperCase() === "D2");
    if (idx >= 0) {
      const row = { ...(rows[idx] || {}) };
      const rowDecision = String(row?.decision || "").trim().toUpperCase();
      if (rowDecision === "ACHIEVED") {
        const d2Check = evaluateU4002A2D2SoftwareConfirmationEvidence(row);
        if (!d2Check.ok) {
          row.decision = "NOT_ACHIEVED";
          row.confidence = Math.min(Number(row?.confidence || 0.55), 0.45);
          row.rationale = sanitizeStudentFeedbackLine(
            "D2 not achieved: screenshots are present, but analytical answers are not clearly confirmed against software outputs for at least three problems (add markers/labels/cursor values plus explicit comparisons)."
          );
          rows[idx] = row;
          notes.push(
            `Decision guard applied: U4002 A2 D2 requires explicit software-to-analytical confirmation across at least 3 problems (qualified evidence ${d2Check.qualifiedEvidenceCount}, scope ${d2Check.evidenceScopeCount}).`
          );
        }
      }
    }
  }

  next.criterionChecks = rows;
  return { decision: next, notes };
}

function firstSentence(value: unknown, maxLen = 170) {
  const compact = sanitizeStudentFeedbackLine(String(value || "").replace(/\s+/g, " ").trim());
  if (!compact) return "";
  const sentence = compact.split(/[.!?]/)[0] || compact;
  if (sentence.length <= maxLen) return sentence;
  return `${sentence.slice(0, Math.max(40, maxLen - 1))}...`;
}

function clipNoEllipsis(value: unknown, maxLen = 320) {
  const text = normalizeText(value);
  if (!text) return "";
  if (text.length <= maxLen) return text;
  const clipped = text.slice(0, Math.max(80, maxLen));
  const sentenceStop = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "), clipped.lastIndexOf("? "));
  if (sentenceStop > Math.floor(maxLen * 0.55)) {
    return clipped.slice(0, sentenceStop + 1).trim();
  }
  return clipped.replace(/\s+\S*$/, "").replace(/[,:;(\-\s]+$/, "").trim();
}

function buildRubricHintsByCriterionCode(rubricText: string) {
  const lines = String(rubricText || "")
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const buckets = new Map<string, string[]>();
  let activeCode = "";

  for (const line of lines) {
    const header = line.match(/^([PMD]\d{1,2})\b(?:[\s:.\-–—]+(.*))?$/i);
    if (header) {
      activeCode = String(header[1] || "").toUpperCase();
      if (!buckets.has(activeCode)) buckets.set(activeCode, []);
      const remainder = normalizeText(header[2] || "");
      if (remainder) buckets.get(activeCode)!.push(remainder);
      continue;
    }

    if (!activeCode) continue;
    if (/^(?:p|m|d)\d{1,2}\b/i.test(line)) continue;
    if (/^(?:page|task)\b/i.test(line) && line.length <= 24) continue;
    buckets.get(activeCode)!.push(line);
  }

  const out = new Map<string, string>();
  for (const [code, rows] of buckets.entries()) {
    const merged = clipNoEllipsis(rows.join(" "), 300);
    if (merged) out.set(code, merged);
  }
  return out;
}

async function resolveRubricSupportContext(input: {
  useRubric: boolean;
  rubricAttachment: any;
  criteriaCodes: string[];
  briefSupportNotes?: string | null;
}) {
  const criteriaCodes = Array.from(
    new Set(
      (Array.isArray(input.criteriaCodes) ? input.criteriaCodes : [])
        .map((code) => String(code || "").trim().toUpperCase())
        .filter((code) => /^[PMD]\d{1,2}$/.test(code))
    )
  );
  const rubricAttachment = input.rubricAttachment || null;
  const briefSupportNotes = normalizeText(input.briefSupportNotes || "");
  const attachedDocId = String(rubricAttachment?.documentId || "").trim() || null;
  const warnings: string[] = [];

  if (!input.useRubric) {
    return {
      hint: "Rubric usage disabled for this run.",
      promptContext: "Rubric usage disabled by grading settings for this run.",
      meta: {
        enabled: false,
        attachmentDetected: Boolean(attachedDocId),
        documentId: attachedDocId,
        filename: String(rubricAttachment?.originalFilename || "").trim() || null,
        source: "none",
        textChars: 0,
        criteriaHintsCount: 0,
        criteriaCodesCovered: [] as string[],
        warnings,
      },
    };
  }

  if (!attachedDocId && !briefSupportNotes) {
    return {
      hint: "No rubric attachment used.",
      promptContext: "No rubric attachment found for this brief.",
      meta: {
        enabled: true,
        attachmentDetected: false,
        documentId: null,
        filename: null,
        source: "none",
        textChars: 0,
        criteriaHintsCount: 0,
        criteriaCodesCovered: [] as string[],
        warnings,
      },
    };
  }

  if (!attachedDocId && briefSupportNotes) {
    const hintsByCode = buildRubricHintsByCriterionCode(briefSupportNotes);
    const coveredCodes = criteriaCodes.filter((code) => hintsByCode.has(code));
    const maxHints = safeEnvInt("GRADE_RUBRIC_MAX_CRITERIA_HINTS", 40, 5, 120);
    const criterionHints = coveredCodes.slice(0, maxHints).map((code) => ({
      code,
      hint: hintsByCode.get(code) || "",
    }));
    const lines: string[] = [
      "Use brief-level supportive guidance across all criteria where relevant, while keeping decisions evidence-led.",
    ];
    if (criterionHints.length) {
      lines.push("Support guidance by criterion code:");
      for (const row of criterionHints) lines.push(`- ${row.code}: ${row.hint}`);
    } else {
      lines.push(`Support guidance excerpt: ${clipNoEllipsis(briefSupportNotes, 1200)}`);
    }
    return {
      hint:
        criterionHints.length > 0
          ? `Brief support guidance loaded (${criterionHints.length} criterion hints).`
          : "Brief support guidance loaded.",
      promptContext: lines.join("\n"),
      meta: {
        enabled: true,
        attachmentDetected: false,
        documentId: null,
        filename: null,
        source: "stored_preview",
        textChars: briefSupportNotes.length,
        criteriaHintsCount: criterionHints.length,
        criteriaCodesCovered: coveredCodes,
        warnings,
      },
    };
  }

  const rubricDoc = await prisma.referenceDocument.findUnique({
    where: { id: attachedDocId },
    select: {
      id: true,
      originalFilename: true,
      storagePath: true,
      extractedJson: true,
      sourceMeta: true,
      status: true,
    },
  });
  if (!rubricDoc) {
    warnings.push("Attached rubric document was not found.");
    return {
      hint: "Rubric attachment metadata exists, but document was not found.",
      promptContext: "Rubric attachment exists but could not be loaded.",
      meta: {
        enabled: true,
        attachmentDetected: true,
        documentId: attachedDocId,
        filename: String(rubricAttachment?.originalFilename || "").trim() || null,
        source: "none",
        textChars: 0,
        criteriaHintsCount: 0,
        criteriaCodesCovered: [] as string[],
        warnings,
      },
    };
  }

  let rubricText = "";
  let source: "none" | "stored_preview" | "extracted_file" = "none";
  const supportNotes = normalizeText(
    [briefSupportNotes, normalizeText((rubricDoc.sourceMeta as any)?.rubricSupportNotes || "")]
      .filter(Boolean)
      .join("\n\n")
  );

  const sourceMetaPreview = normalizeText((rubricDoc.sourceMeta as any)?.rubricTextPreview || "");
  if (sourceMetaPreview) {
    rubricText = sourceMetaPreview;
    source = "stored_preview";
  }

  if (!rubricText) {
    const extractedPreview = normalizeText((rubricDoc.extractedJson as any)?.preview || "");
    if (extractedPreview) {
      rubricText = extractedPreview;
      source = "stored_preview";
    }
  }

  if (!rubricText) {
    try {
      const extracted = await extractFile(rubricDoc.storagePath, rubricDoc.originalFilename);
      rubricText = normalizeText((extracted.pages || []).map((p) => p.text || "").join("\n\n"));
      source = rubricText ? "extracted_file" : "none";
      if (Array.isArray(extracted.warnings) && extracted.warnings.length) {
        warnings.push(...extracted.warnings.slice(0, 6).map((w) => `extract: ${w}`));
      }
    } catch (e: any) {
      warnings.push(`Rubric extraction failed: ${String(e?.message || e)}`);
    }
  }

  const rubricCharLimit = safeEnvInt("GRADE_RUBRIC_TEXT_MAX_CHARS", 14000, 1200, 60000);
  rubricText = clipNoEllipsis([rubricText, supportNotes].filter(Boolean).join("\n\n"), rubricCharLimit);

  const hintsByCode = buildRubricHintsByCriterionCode(rubricText);
  const coveredCodes = criteriaCodes.filter((code) => hintsByCode.has(code));
  const maxHints = safeEnvInt("GRADE_RUBRIC_MAX_CRITERIA_HINTS", 40, 5, 120);
  const criterionHints = coveredCodes.slice(0, maxHints).map((code) => ({
    code,
    hint: hintsByCode.get(code) || "",
  }));

  const promptLines: string[] = [
    "Use rubric/supportive guidance across all criteria where relevant, but keep decisions evidence-led against the official criteria list.",
  ];
  if (criterionHints.length) {
    promptLines.push("Rubric expectations by criterion code:");
    for (const row of criterionHints) {
      promptLines.push(`- ${row.code}: ${row.hint}`);
    }
  } else if (rubricText) {
    promptLines.push(`Rubric excerpt: ${clipNoEllipsis(rubricText, 1200)}`);
  } else {
    promptLines.push("Rubric text could not be extracted; continue without rubric-specific guidance.");
  }
  if (warnings.length) {
    promptLines.push(`Rubric warnings: ${warnings.slice(0, 3).join(" | ")}`);
  }

  const hint =
    criterionHints.length > 0
      ? `Rubric attached: ${String(rubricDoc.originalFilename || rubricAttachment?.originalFilename || "yes")} (${criterionHints.length} criterion hint${criterionHints.length === 1 ? "" : "s"}).`
      : rubricText
        ? `Rubric attached: ${String(rubricDoc.originalFilename || rubricAttachment?.originalFilename || "yes")} (generic guidance extracted).`
        : `Rubric attached: ${String(rubricDoc.originalFilename || rubricAttachment?.originalFilename || "yes")} (text extraction unavailable).`;

  return {
    hint,
    promptContext: promptLines.join("\n"),
    meta: {
      enabled: true,
      attachmentDetected: true,
      documentId: rubricDoc.id,
      filename: String(rubricDoc.originalFilename || "").trim() || null,
      source,
      textChars: rubricText.length,
      criteriaHintsCount: criterionHints.length,
      criteriaCodesCovered: coveredCodes,
      warnings,
    },
  };
}

function formatCriterionCodes(codes: string[], max = 6) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(codes) ? codes : [])
        .map((code) => String(code || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
  if (!normalized.length) return "";
  if (normalized.length <= max) return normalized.join(", ");
  const shown = normalized.slice(0, Math.max(1, max));
  return `${shown.join(", ")} (+${normalized.length - shown.length} more)`;
}

function normalizeLoOutcomeLabel(value: unknown) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  const tagged = raw.match(/\bLO\s*([1-9]\d*)\b/i);
  if (tagged) return `LO${tagged[1]}`;
  const plain = raw.match(/^([1-9]\d*)$/);
  if (plain) return `LO${plain[1]}`;
  return raw;
}

function buildCriterionOutcomeSummaryBlock(input: {
  criteria: Array<{ code?: string; band?: string; lo?: string; description?: string }>;
  criterionChecks: Array<{ code?: string; decision?: string; rationale?: string }>;
}) {
  const criteriaRows = Array.isArray(input.criteria) ? input.criteria : [];
  const checkRows = Array.isArray(input.criterionChecks) ? input.criterionChecks : [];
  if (!criteriaRows.length && !checkRows.length) return "";

  const orderByCode = new Map<string, number>();
  const loByCode = new Map<string, string>();
  for (let i = 0; i < criteriaRows.length; i += 1) {
    const row = criteriaRows[i];
    const code = String(row?.code || "").trim().toUpperCase();
    if (!code) continue;
    if (!orderByCode.has(code)) orderByCode.set(code, i);
    const loLabel = normalizeLoOutcomeLabel(row?.lo);
    if (loLabel && !loByCode.has(code)) loByCode.set(code, loLabel);
  }

  const decisionByCode = new Map<string, "ACHIEVED" | "NOT_ACHIEVED" | "UNCLEAR">();
  const reasonByCode = new Map<string, string>();
  for (const row of checkRows) {
    const code = String(row?.code || "").trim().toUpperCase();
    if (!code) continue;
    const decisionRaw = String(row?.decision || "").trim().toUpperCase();
    const decision =
      decisionRaw === "ACHIEVED" || decisionRaw === "NOT_ACHIEVED" || decisionRaw === "UNCLEAR"
        ? (decisionRaw as "ACHIEVED" | "NOT_ACHIEVED" | "UNCLEAR")
        : "UNCLEAR";
    if (!decisionByCode.has(code)) decisionByCode.set(code, decision);
    if (decision !== "ACHIEVED" && !reasonByCode.has(code)) {
      const reason = firstSentence(row?.rationale || "", 400);
      if (reason) reasonByCode.set(code, reason);
    }
  }

  const compareCodes = (a: string, b: string) =>
    (orderByCode.get(a) ?? Number.MAX_SAFE_INTEGER) - (orderByCode.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b);
  const allCodes = Array.from(new Set([...orderByCode.keys(), ...decisionByCode.keys()])).sort(compareCodes);
  const achievedCodes = allCodes.filter((code) => decisionByCode.get(code) === "ACHIEVED");
  const outstandingCodes = allCodes.filter((code) => {
    const d = decisionByCode.get(code);
    return d === "NOT_ACHIEVED" || d === "UNCLEAR";
  });

  const lines: string[] = [];
  if (achievedCodes.length) {
    lines.push(`Criteria achieved: ${formatCriterionCodes(achievedCodes, 10)}.`);
  }
  if (outstandingCodes.length) {
    lines.push(`Criteria still to evidence clearly: ${formatCriterionCodes(outstandingCodes, 10)}.`);
    const reasonParts = outstandingCodes
      .map((code) => {
        const reason = reasonByCode.get(code);
        if (!reason) return "";
        return `${code}: ${reason}`;
      })
      .filter(Boolean)
      .slice(0, 3);
    if (reasonParts.length) {
      lines.push(`Why these are still open: ${reasonParts.join(" ")}`);
    }
  }

  const loGroups = new Map<string, string[]>();
  for (const code of allCodes) {
    const lo = loByCode.get(code);
    if (!lo) continue;
    const arr = loGroups.get(lo) || [];
    arr.push(code);
    loGroups.set(lo, arr);
  }
  if (loGroups.size > 0) {
    const loLabels = Array.from(loGroups.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const metLos: string[] = [];
    const partialLos: string[] = [];
    const missingLos: string[] = [];
    for (const lo of loLabels) {
      const codes = (loGroups.get(lo) || []).sort(compareCodes);
      const achieved = codes.filter((code) => decisionByCode.get(code) === "ACHIEVED");
      const outstanding = codes.filter((code) => decisionByCode.get(code) !== "ACHIEVED");
      if (achieved.length === codes.length && codes.length > 0) {
        metLos.push(lo);
      } else if (achieved.length > 0) {
        partialLos.push(`${lo} (achieved: ${formatCriterionCodes(achieved, 8)}; still open: ${formatCriterionCodes(outstanding, 8)})`);
      } else {
        missingLos.push(`${lo} (${formatCriterionCodes(outstanding, 8)} outstanding)`);
      }
    }
    if (metLos.length) {
      lines.push(`Learning outcomes fully evidenced here: ${formatCriterionCodes(metLos, 8)}.`);
    }
    if (partialLos.length) {
      lines.push(`Learning outcomes partially evidenced: ${partialLos.slice(0, 3).join("; ")}.`);
    }
    if (missingLos.length) {
      lines.push(`Learning outcomes not yet evidenced in full: ${missingLos.slice(0, 2).join("; ")}.`);
    }
  }

  return lines.filter(Boolean).join("\n").trim();
}

function buildHigherGradeGapBullets(input: {
  finalGrade: string;
  rawGrade: string;
  gradePolicy: { wasCapped?: boolean; capReason?: string | null };
  bandCapPolicy: {
    missing?: { pass?: string[]; merit?: string[]; distinction?: string[] };
  };
  criterionChecks: Array<{ code?: string; decision?: string; rationale?: string }>;
}) {
  const out: string[] = [];
  const finalGrade = String(input.finalGrade || "").trim().toUpperCase();
  const rawGrade = String(input.rawGrade || "").trim().toUpperCase();
  const missingPass = Array.isArray(input.bandCapPolicy?.missing?.pass) ? input.bandCapPolicy.missing.pass : [];
  const missingMerit = Array.isArray(input.bandCapPolicy?.missing?.merit) ? input.bandCapPolicy.missing.merit : [];
  const missingDistinction = Array.isArray(input.bandCapPolicy?.missing?.distinction)
    ? input.bandCapPolicy.missing.distinction
    : [];
  const rationaleByCode = new Map<string, string>();
  for (const row of Array.isArray(input.criterionChecks) ? input.criterionChecks : []) {
    const code = String(row?.code || "").trim().toUpperCase();
    if (!code || rationaleByCode.has(code)) continue;
    const decision = String(row?.decision || "").trim().toUpperCase();
    if (decision === "ACHIEVED") continue;
    const reason = firstSentence(row?.rationale || "");
    if (reason) rationaleByCode.set(code, reason);
  }
  const missingReasonLine = (codes: string[]) =>
    codes
      .map((code) => {
        const normalized = String(code || "").trim().toUpperCase();
        const reason = rationaleByCode.get(normalized);
        if (!normalized || !reason) return "";
        return `${normalized}: ${reason}`;
      })
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");

  if (input.gradePolicy?.wasCapped && String(input.gradePolicy?.capReason || "").includes("RESUBMISSION")) {
    out.push("This submission is currently capped at PASS on resubmission policy until the reassessment conditions are met.");
  }

  if (finalGrade === "REFER") {
    if (missingPass.length) {
      const line = formatNextBandRequirementLine("PASS", missingPass);
      if (line) out.push(line);
      const reasons = missingReasonLine(missingPass);
      if (reasons) out.push(`Priority improvements: ${reasons}`);
    }
    return out;
  }

  if (finalGrade === "PASS" || finalGrade === "PASS_ON_RESUBMISSION") {
    if (missingMerit.length) {
      const line = formatNextBandRequirementLine("MERIT", missingMerit);
      if (line) out.push(line);
      const reasons = missingReasonLine(missingMerit);
      if (reasons) out.push(`Merit gap to address: ${reasons}`);
    } else if (rawGrade === "DISTINCTION" && missingDistinction.length) {
      // Edge-case: model overcalled distinction but policy reduced grade.
      const line = formatNextBandRequirementLine("DISTINCTION", missingDistinction);
      if (line) out.push(line);
    }
    return out;
  }

  if (finalGrade === "MERIT" && missingDistinction.length) {
    const line = formatNextBandRequirementLine("DISTINCTION", missingDistinction);
    if (line) out.push(line);
    const reasons = missingReasonLine(missingDistinction);
    if (reasons) out.push(`Distinction gap to address: ${reasons}`);
  }
  return out;
}

function buildCriterionSpecificFeedbackBullets(input: {
  unitCode: string;
  assignmentCode: string;
  criterionChecks: Array<{ code?: string; decision?: string; evidence?: any[] }>;
  submissionCompliance: SubmissionComplianceCheck | null;
  handwritingLikely: boolean;
  readableEvidenceLikely: boolean;
  noteToneProfile: ToneProfile;
}) {
  const out: string[] = [];
  const unitCode = String(input.unitCode || "").trim();
  const assignmentCode = String(input.assignmentCode || "").trim().toUpperCase();
  const toneProfile = input.noteToneProfile;
  const rows = Array.isArray(input.criterionChecks) ? input.criterionChecks : [];
  const decisionByCode = new Map<string, string>();
  const rowByCode = new Map<string, { code?: string; decision?: string; evidence?: any[] }>();
  for (const row of rows) {
    const code = String(row?.code || "").trim().toUpperCase();
    if (!code || decisionByCode.has(code)) continue;
    decisionByCode.set(code, String(row?.decision || "").trim().toUpperCase());
    rowByCode.set(code, row);
  }

  const evidenceTextForCode = (code: string) =>
    (Array.isArray(rowByCode.get(code)?.evidence) ? rowByCode.get(code)?.evidence : [])
      .map((ev: any) => `${String(ev?.quote || "")} ${String(ev?.visualDescription || "")}`.trim())
      .filter(Boolean)
      .join(" ");

  if (unitCode === "4002" && assignmentCode === "A2") {
    const p6Achieved = decisionByCode.get("P6") === "ACHIEVED";
    const p7Achieved = decisionByCode.get("P7") === "ACHIEVED";
    const m3Achieved = decisionByCode.get("M3") === "ACHIEVED";
    const d2Achieved = decisionByCode.get("D2") === "ACHIEVED";
    const m3EvidenceText = evidenceTextForCode("M3");
    const d2EvidenceText = evidenceTextForCode("D2");
    const hasGraphEvidence = /\b(graph|plot|waveform|figure|chart|diagram|screenshot|overlay)\b/i.test(m3EvidenceText);
    const hasSoftwareEvidence =
      /\b(software|geogebra|desmos|graphing|matlab|excel|plot|screenshot|readout|cursor|marker)\b/i.test(
        d2EvidenceText
      );
    if (p6Achieved || p7Achieved) {
      out.push(
        pickTonePhrase(
          toneProfile.phrases.praise,
          `${unitCode}|${assignmentCode}|praise`,
          "Nice clear working across Tasks 1 to 3. Your method is generally easy to follow."
        )
      );
    }
    if (m3Achieved && hasGraphEvidence) {
      out.push("Good use of graphical evidence to support your compound-angle/single-wave method.");
    }
    if (d2Achieved && hasSoftwareEvidence) {
      out.push(
        "Good use of software evidence to confirm analytical results. Keep labels/markers visible so the match is quick to verify."
      );
    }
    if (decisionByCode.has("M3") && !m3Achieved) {
      const leadIn = pickTonePhrase(
        toneProfile.phrases.nextGradeLeadIns,
        `${unitCode}|${assignmentCode}|m3-gap`,
        "To reach MERIT,"
      );
      out.push(
        `${leadIn} add the required graph for Task 4(b) and explain how the graph supports your combined-wave result.`
      );
    }
    if (decisionByCode.has("D2") && !d2Achieved) {
      const leadIn = pickTonePhrase(
        toneProfile.phrases.nextGradeLeadIns,
        `${unitCode}|${assignmentCode}|d2-gap`,
        "To reach DISTINCTION,"
      );
      out.push(
        `${leadIn} include software outputs for at least three problems, then state clearly how each output confirms your calculated values.`
      );
      out.push(
        "Where screenshots are used, add labels/markers/cursor values and one short comparison sentence so the confirmation is explicit."
      );
    }
    if (decisionByCode.has("P7")) {
      out.push(
        "Task 1(b): state magnitudes explicitly (absolute values), then optionally include signed components to show direction."
      );
    }
    if (input.submissionCompliance?.status === "RETURN_REQUIRED") {
      out.push(
        pickTonePhrase(
          toneProfile.phrases.complianceAdvice,
          `${unitCode}|${assignmentCode}|compliance`,
          "Submission compliance: add zbib Harvard references with a 'link to this version' entry before final handoff."
        )
      );
    }
    if (input.handwritingLikely) {
      out.push(
        pickTonePhrase(
          toneProfile.phrases.handwritingAdvice,
          `${unitCode}|${assignmentCode}|handwriting`,
          "Presentation suggestion: keep headings/explanations word-processed, and insert neat scans/photos of handwritten mathematics."
        )
      );
    }
  }

  if (input.readableEvidenceLikely) {
    const leadIn = pickTonePhrase(
      toneProfile.phrases.evidenceLeadIns,
      `${unitCode}|${assignmentCode}|evidence`,
      "Evidence observed:"
    );
    out.push(`${leadIn} keep page references clear so each criterion can be tracked quickly.`);
  }

  return out;
}

function buildFriendlyFeedbackSummary(input: {
  unitCode: string;
  assignmentCode: string;
  overallGrade: string;
  feedbackSummary: string;
  criterionChecks: Array<{ code?: string; decision?: string }>;
  readableEvidenceLikely: boolean;
  noteToneProfile: ToneProfile;
}) {
  const unitCode = String(input.unitCode || "").trim();
  const assignmentCode = String(input.assignmentCode || "").trim().toUpperCase();
  const original = warmenFriendlyFeedbackSummary({
    summary: input.feedbackSummary,
    overallGrade: input.overallGrade,
  });
  const rows = Array.isArray(input.criterionChecks) ? input.criterionChecks : [];
  const decisionByCode = new Map<string, string>();
  for (const row of rows) {
    const code = String(row?.code || "").trim().toUpperCase();
    if (!code || decisionByCode.has(code)) continue;
    decisionByCode.set(code, String(row?.decision || "").trim().toUpperCase());
  }

  let summary = original;
  if (input.readableEvidenceLikely && containsBlankContentClaim(summary)) {
    summary = "Your submission contains readable worked content, and the assessment below is based on the evidenced sections.";
  }

  if (unitCode === "4002" && assignmentCode === "A2") {
    const p6Achieved = decisionByCode.get("P6") === "ACHIEVED";
    const p7Achieved = decisionByCode.get("P7") === "ACHIEVED";
    const m3Achieved = decisionByCode.get("M3") === "ACHIEVED";
    const d2Achieved = decisionByCode.get("D2") === "ACHIEVED";
    if (!p6Achieved || !p7Achieved) {
      return "Pass-level evidence is incomplete. Strengthen the core sinusoidal and vector tasks with clear page-linked working.";
    }
    if (m3Achieved && d2Achieved) {
      return "Strong evidence across pass, merit, and distinction requirements. Your graphical and software-confirmation evidence supports the analytical results.";
    }
    if (m3Achieved && !d2Achieved) {
      return "Pass and Merit outcomes are evidenced. Distinction is currently blocked because D2 needs explicit software-to-calculation confirmation across at least three distinct problems.";
    }
    return "Good start. Pass outcomes are evidenced in Tasks 1 to 3. To progress, strengthen Task 4 graphical/software confirmation evidence for higher bands.";
  }
  return summary;
}

function buildAssignmentSpecificPromptRules(input: { unitCode: string; assignmentCode: string }) {
  const unitCode = String(input.unitCode || "").trim();
  const assignmentCode = String(input.assignmentCode || "").trim().toUpperCase();
  if (unitCode === "4002" && assignmentCode === "A2") {
    return [
      "Assignment policy override:",
      "- This submission is U4002 Assignment 2 and must be graded against LO3 criteria only: P6, P7, M3, D2.",
      "- Do not reference or infer unrelated criteria (for example P1-P5).",
      "- Handwritten mathematics is valid evidence when legible.",
      "- Do not claim the submission is blank/unreadable unless page samples and provided images both lack readable mathematical work.",
      "- If Task 1(b) asks for magnitudes, expect magnitudes as positive values with direction expressed separately if needed.",
      "- Keep task mapping correct: Task 2(a) is RL phasor resultant voltage, and Task 2(b) is vector cross product.",
      "- D2 pragmatic rule: award only when software outputs are linked explicitly to analytical results for at least 3 distinct problems.",
      "- Screenshots alone are insufficient for D2 unless they include labels/markers/readouts or an explicit written comparison.",
    ];
  }
  return [] as string[];
}

function countWords(value: unknown) {
  const txt = String(value || "").trim();
  if (!txt) return 0;
  return txt.split(/\s+/).filter(Boolean).length;
}

function buildEvidenceDensityByCriterion(criterionChecks: any[]) {
  const rows = Array.isArray(criterionChecks) ? criterionChecks : [];
  return rows.map((row: any) => {
    const code = String(row?.code || "").trim().toUpperCase();
    const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
    const pages = Array.from(
      new Set<number>(
        evidence
          .map((e: any) => Number(e?.page))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      )
    ).sort((a, b) => a - b);
    const citedWords = evidence.reduce((sum: number, e: any) => {
      const quoteWords = countWords(e?.quote);
      const visualWords = countWords(e?.visualDescription);
      return sum + quoteWords + visualWords;
    }, 0);
    return {
      code,
      citationCount: evidence.length,
      totalWordsCited: citedWords,
      pageDistribution: pages,
      pageSpread: pages.length,
    };
  });
}

const PAGE_NOTE_SPILL_GUARD_TERMS = [
  // Energy/power unit leakage terms
  "renewable",
  "solar",
  "pv",
  "wind",
  "hydro",
  "geothermal",
  "lcoe",
  "converter",
  "smart grid",
  "simulink",
  "matlab",
  // Maths/phasor unit leakage terms
  "phasor",
  "sinusoidal",
  "compound-angle",
  "waveform",
  "determinant",
  "vector component",
  "geogebra",
  "desmos",
  // Project-management unit leakage terms
  "telos",
  "risk register",
  "critical path",
  "cpm",
  "rag status",
  "milestone tracker",
  "gantt chart",
] as const;

function isNotesAiRewriteEnabledByEnv() {
  const raw = String(
    process.env.NOTES_AI_REWRITE || (process.env.NODE_ENV === "production" ? "true" : "false")
  )
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

function normalizeNoteCriterionCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase();
  return /^[PMD]\d{1,2}$/.test(code) ? code : "";
}

function sanitizeAiPolishedNoteText(value: unknown) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\s*[-*•]\s*/gm, "")
    .replace(/\b(?:Strength|Improvement|Link|Presentation)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimPageNoteWordBudget(value: string, maxWords = 95) {
  const text = sanitizeAiPolishedNoteText(value);
  if (!text) return "";
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ").replace(/\s+\S*$/, "").trim().replace(/[,:;\s-]+$/, "").concat(".");
}

function buildPageNoteSourceCorpusMap(
  notes: MarkedPageNote[],
  criterionChecks: PageNoteCriterionCheckRow[]
) {
  const out = new Map<string, string>();
  const rows = Array.isArray(criterionChecks) ? criterionChecks : [];
  for (const note of Array.isArray(notes) ? notes : []) {
    const page = Number(note?.page || 0);
    const code = normalizeNoteCriterionCode(note?.criterionCode);
    if (!page || !code) continue;
    const bits: string[] = [];
    for (const row of rows) {
      const rowCode = normalizeNoteCriterionCode(row?.code);
      if (rowCode !== code) continue;
      bits.push(String(row?.rationale || row?.comment || ""));
      for (const ev of Array.isArray(row?.evidence) ? row.evidence : []) {
        if (Number(ev?.page || 0) !== page) continue;
        bits.push(String(ev?.quote || ""));
        bits.push(String(ev?.visualDescription || ""));
      }
    }
    const key = `${page}:${code}`;
    out.set(key, normalizeText(bits.join(" ")).toLowerCase());
  }
  return out;
}

function pageNoteContainsForeignCriteria(input: {
  text: string;
  noteCriterionCode?: string;
  allowedCriteriaSet?: string[] | null;
  allowCriterionCodesInText?: boolean;
}) {
  const text = String(input.text || "");
  const noteCode = normalizeNoteCriterionCode(input.noteCriterionCode);
  const allowed = new Set(
    (Array.isArray(input.allowedCriteriaSet) ? input.allowedCriteriaSet : [])
      .map((c) => normalizeNoteCriterionCode(c))
      .filter(Boolean)
  );
  if (noteCode) allowed.add(noteCode);
  const matches = Array.from(text.matchAll(/\b([PMD]\d{1,2})\b/gi)).map((m) => String(m[1] || "").toUpperCase());
  if (!matches.length) return false;
  if (!input.allowCriterionCodesInText) return true;
  return matches.some((code) => !allowed.has(code) || (noteCode && code !== noteCode));
}

function pageNoteContainsOutOfContextLeakTerms(input: {
  text: string;
  sourceCorpus: string;
  context?: PageNoteGenerationContext | null;
}) {
  const text = String(input.text || "").toLowerCase();
  const source = String(input.sourceCorpus || "").toLowerCase();
  if (!text) return false;
  const banned = new Set<string>(resolvePageNoteBannedKeywords(input.context));
  for (const term of PAGE_NOTE_SPILL_GUARD_TERMS) banned.add(term);
  for (const term of banned) {
    const normalized = String(term || "").trim().toLowerCase();
    if (!normalized) continue;
    if (!text.includes(normalized)) continue;
    if (source.includes(normalized)) continue;
    const fuzzyTokens = normalized
      .split(/[^a-z0-9]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);
    if (fuzzyTokens.length >= 2 && fuzzyTokens.every((t) => source.includes(t))) continue;
    return true;
  }
  return false;
}

async function maybePolishPageNotesWithAi(input: {
  enabled: boolean;
  apiKey: string;
  model: string;
  fallbackModel?: string | null;
  tone: string;
  notes: MarkedPageNote[];
  criterionChecks: PageNoteCriterionCheckRow[];
  context?: PageNoteGenerationContext | null;
  allowCriterionCodesInText: boolean;
}) {
  if (!input.enabled) {
    return { notes: input.notes, applied: false, reason: "disabled" as const, replacedCount: 0 };
  }
  const notes = Array.isArray(input.notes) ? input.notes : [];
  if (!notes.length) {
    return { notes, applied: false, reason: "no-notes" as const, replacedCount: 0 };
  }

  const sourceCorpusByNote = buildPageNoteSourceCorpusMap(notes, input.criterionChecks);
  const promptPayload = notes.slice(0, 20).map((note) => {
    const page = Number(note.page || 0);
    const criterionCode = normalizeNoteCriterionCode(note.criterionCode);
    const sourceKey = `${page}:${criterionCode}`;
    return {
      page,
      criterionCode: criterionCode || null,
      rawNote: (Array.isArray(note.lines) ? note.lines : []).join(" ").trim(),
      sourceEvidenceHint: String(sourceCorpusByNote.get(sourceKey) || "").slice(0, 500),
      sectionLabel: note.sectionLabel || null,
    };
  });

  const buildBody = (modelName: string) =>
    JSON.stringify({
      model: modelName,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Rewrite the page notes into natural, student-facing UK English.",
                "Keep each note specific to the evidence already shown on that page.",
                "Do not invent methods, tasks, criteria, or assignment details not in the provided raw note/evidence hint.",
                "Do not use template labels like Strength:, Improvement:, Link:, or Presentation:.",
                "Use one short coherent note per page (1-3 sentences).",
                "Keep the same meaning and action points, but make the wording more human and less repetitive.",
                `Tone: ${String(input.tone || "supportive")}.`,
                `Unit: ${String(input.context?.unitCode || "") || "unknown"}. Assignment: ${String(input.context?.assignmentCode || "") || "unknown"}.`,
                `Criterion codes in note text allowed: ${input.allowCriterionCodesInText ? "yes" : "no"}.`,
                "Return JSON only.",
                "",
                JSON.stringify({ notes: promptPayload }, null, 2),
              ].join("\n"),
            },
          ],
        },
      ],
      ...buildResponsesTemperatureParam(modelName, 0.2),
      max_output_tokens: Math.max(500, Math.min(2200, 260 + notes.length * 180)),
      text: {
        format: {
          type: "json_schema",
          name: "page_note_rewrites",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              notes: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    page: { type: "number" },
                    criterionCode: { type: ["string", "null"] },
                    noteText: { type: "string" },
                  },
                  required: ["page", "criterionCode", "noteText"],
                },
              },
            },
            required: ["notes"],
          },
        },
      },
    });

  const fetchRewrite = (modelName: string) =>
    fetchOpenAiJson(
      "/v1/responses",
      input.apiKey,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: buildBody(modelName),
      },
      {
        timeoutMs: Number(process.env.OPENAI_PAGE_NOTES_POLISH_TIMEOUT_MS || 25000),
        retries: 1,
      }
    );

  let usedModel = String(input.model || "").trim();
  let response = await fetchRewrite(usedModel);
  if (
    !response.ok &&
    isModelVerificationBlocked(response.message, usedModel) &&
    input.fallbackModel &&
    input.fallbackModel !== usedModel
  ) {
    const fallback = await fetchRewrite(String(input.fallbackModel || "").trim());
    if (fallback.ok) {
      response = fallback;
      usedModel = String(input.fallbackModel || "").trim();
    }
  }
  if (!response.ok) {
    return { notes, applied: false, reason: "api-error" as const, replacedCount: 0, error: response.message };
  }

  const usage = (response.json as any)?.usage || null;
  if (usage) {
    recordOpenAiUsage({
      model: usedModel,
      op: "page_note_polish",
      usage,
    });
  }
  const parsed = extractStructuredModelJson(response.json) as
    | { notes?: Array<{ page?: number; criterionCode?: string | null; noteText?: string }> }
    | null;
  const rewrites = Array.isArray(parsed?.notes) ? parsed!.notes! : [];
  if (!rewrites.length) {
    return { notes, applied: false, reason: "empty-output" as const, replacedCount: 0 };
  }

  const rewriteByKey = new Map<string, { noteText: string; criterionCode: string }>();
  for (const row of rewrites) {
    const page = Number(row?.page || 0);
    const criterionCode = normalizeNoteCriterionCode(row?.criterionCode);
    const noteText = sanitizeAiPolishedNoteText(row?.noteText);
    if (!page || !noteText) continue;
    rewriteByKey.set(`${page}:${criterionCode}`, { noteText, criterionCode });
  }

  let replacedCount = 0;
  const nextNotes = notes.map((note) => {
    const page = Number(note?.page || 0);
    const criterionCode = normalizeNoteCriterionCode(note?.criterionCode);
    const key = `${page}:${criterionCode}`;
    const rewrite = rewriteByKey.get(key);
    if (!rewrite) return note;

    const sourceCorpus = sourceCorpusByNote.get(key) || "";
    let noteText = sanitizeAiPolishedNoteText(rewrite.noteText);
    if (!noteText) return note;
    noteText = repairPageNoteTextAdvice(noteText);
    noteText = trimPageNoteWordBudget(noteText);
    if (!noteText) return note;
    if (pageNoteContainsForeignCriteria({
      text: noteText,
      noteCriterionCode: criterionCode,
      allowedCriteriaSet: input.context?.criteriaSet || [],
      allowCriterionCodesInText: input.allowCriterionCodesInText,
    })) {
      return note;
    }
    if (
      pageNoteContainsOutOfContextLeakTerms({
        text: noteText,
        sourceCorpus,
        context: input.context,
      })
    ) {
      return note;
    }
    if (pageNoteTextHasIncompleteAdvice(noteText)) {
      return note;
    }
    replacedCount += 1;
    return {
      ...note,
      lines: [noteText],
      items: [
        {
          kind: ((note as any)?.severity === "info" ? "praise" : "action") as "praise" | "action",
          text: noteText,
        },
      ],
    };
  });

  return {
    notes: nextNotes,
    applied: replacedCount > 0,
    reason: replacedCount > 0 ? ("ok" as const) : ("guard-fallback" as const),
    replacedCount,
  };
}

function diffReferenceSnapshots(previous: any, current: any) {
  if (!previous || !current) {
    return {
      changed: false,
      reason: "no-previous-snapshot",
      deltas: {},
    };
  }
  const prev = previous || {};
  const next = current || {};
  const deltas: Record<string, { from: unknown; to: unknown }> = {};

  const check = (key: string, from: unknown, to: unknown) => {
    if (String(from ?? "") !== String(to ?? "")) {
      deltas[key] = { from: from ?? null, to: to ?? null };
    }
  };

  check("unit.id", prev?.unit?.id, next?.unit?.id);
  check("specDocument.id", prev?.specDocument?.id, next?.specDocument?.id);
  check("specDocument.version", prev?.specDocument?.version, next?.specDocument?.version);
  check("specDocument.issueLabel", prev?.specDocument?.issueLabel, next?.specDocument?.issueLabel);
  check("assignmentBrief.id", prev?.assignmentBrief?.id, next?.assignmentBrief?.id);
  check(
    "assignmentBrief.briefDocument.id",
    prev?.assignmentBrief?.briefDocument?.id,
    next?.assignmentBrief?.briefDocument?.id
  );
  check(
    "assignmentBrief.briefDocument.version",
    prev?.assignmentBrief?.briefDocument?.version,
    next?.assignmentBrief?.briefDocument?.version
  );

  return {
    changed: Object.keys(deltas).length > 0,
    reason: Object.keys(deltas).length > 0 ? "reference-context-drift" : "no-drift",
    deltas,
  };
}

function safeEnvInt(name: string, fallback: number, min: number, max: number) {
  const n = Number(process.env[name] || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function safeEnvNumber(name: string, fallback: number, min: number, max: number) {
  const n = Number(process.env[name] || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function renderPdfPagesForGrading(input: {
  pdfPath: string;
  maxPages: number;
  scale: number;
}): Promise<{
  pageCount: number;
  usedPages: number;
  pages: Array<{ pageNumber: number; imageDataUrl: string }>;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const absPath = path.isAbsolute(input.pdfPath)
    ? input.pdfPath
    : path.join(process.cwd(), input.pdfPath);
  const bytes = new Uint8Array(await fs.readFile(absPath));

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const nodeRequire = eval("require") as NodeRequire;
  const canvasModule = nodeRequire("@napi-rs/canvas") as {
    createCanvas: (w: number, h: number) => any;
  };
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs"
  );
  if (pdfjs?.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();
  }

  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const pageCount = Math.max(1, Number(doc?.numPages || 1));
  const usedPages = Math.min(pageCount, Math.max(1, input.maxPages));
  if (usedPages < pageCount) {
    warnings.push(`Raw PDF input limited to first ${usedPages}/${pageCount} pages.`);
  }

  const pages: Array<{ pageNumber: number; imageDataUrl: string }> = [];
  for (let p = 1; p <= usedPages; p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: input.scale });
    const width = Math.max(1, Math.floor(viewport.width));
    const height = Math.max(1, Math.floor(viewport.height));
    const canvas = canvasModule.createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx as any, viewport }).promise;
    const png = canvas.toBuffer("image/png");
    pages.push({
      pageNumber: p,
      imageDataUrl: `data:image/png;base64,${png.toString("base64")}`,
    });
  }

  return { pageCount, usedPages, pages, warnings };
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const requestId = makeRequestId();
  const perm = await isAdminMutationAllowed();
  if (!perm.ok) {
    return apiError({
      status: 403,
      code: "ADMIN_PERMISSION_REQUIRED",
      userMessage: perm.reason || "Admin permission required.",
      route: "/api/submissions/[submissionId]/grade",
      requestId,
    });
  }
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
    dryRun?: boolean;
  };
  const dryRun = !!body.dryRun;
  const appCfg = await getOrCreateAppConfig();
  const activeAuditUser = appCfg.activeAuditUser?.isActive ? appCfg.activeAuditUser : null;
  const actor = activeAuditUser?.fullName || "system";
  const activeAuditUserId = activeAuditUser?.id || null;

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
                specDocument: true,
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
  if (!dryRun && !submission.studentId) {
    return apiError({
      status: 422,
      code: "GRADE_STUDENT_LINK_REQUIRED",
      userMessage: "Link a student before saving grade to audit. Preview can run without a linked student.",
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
  const feedbackTemplateResolution = resolveFeedbackTemplate(cfg, activeAuditUserId);
  const feedbackTemplate = feedbackTemplateResolution.template;
  const activeModel = readOpenAiModel().model || cfg.model;
  const fallbackModel = String(process.env.OPENAI_GRADE_FALLBACK_MODEL || process.env.OPENAI_MODEL_FALLBACK || "gpt-4o-mini").trim();
  const tone = String(body.tone || cfg.tone || "professional");
  const noteToneProfile = resolveToneProfileFromLegacy(tone);
  const strictness = String(body.strictness || cfg.strictness || "balanced");
  const useRubric = typeof body.useRubricIfAvailable === "boolean" ? body.useRubricIfAvailable : cfg.useRubricIfAvailable;
  const criteriaScopePolicy = resolveCriteriaScopePolicy(String(brief.unit?.unitCode || ""), String(brief.assignmentCode || ""));

  const excludedCriteriaCodes = pickExcludedBriefCriteriaCodes(brief.briefDocument?.sourceMeta);
  const excludedCriteriaSet = new Set(excludedCriteriaCodes);
  const criteriaFromMap = brief.criteriaMaps.map((m) => ({
    criterionId: m.assessmentCriterion.id,
    code: m.assessmentCriterion.acCode,
    band: m.assessmentCriterion.gradeBand,
    lo: m.assessmentCriterion.learningOutcome?.loCode || "",
    description: m.assessmentCriterion.description,
  }));
  const unitFallbackCriteria = brief.unit.learningOutcomes.flatMap((lo) =>
    lo.criteria.map((c) => ({
      criterionId: c.id,
      code: c.acCode,
      band: c.gradeBand,
      lo: lo.loCode,
      description: c.description,
    }))
  );

  const criteriaBeforeExclusions = criteriaFromMap.length > 0 ? criteriaFromMap : unitFallbackCriteria;
  let criteria = criteriaBeforeExclusions.filter(
    (c) => !excludedCriteriaSet.has(String(c.code || "").trim().toUpperCase())
  );

  if (criteriaScopePolicy) {
    const pool = new Map<string, (typeof criteriaBeforeExclusions)[number]>();
    for (const row of [...criteriaFromMap, ...unitFallbackCriteria]) {
      const code = String(row?.code || "").trim().toUpperCase();
      if (!code || pool.has(code)) continue;
      pool.set(code, row);
    }
    const scopedCriteria = criteriaScopePolicy.allowedCriteriaCodes
      .map((code) => pool.get(code))
      .filter(Boolean) as typeof criteriaBeforeExclusions;
    const missingCodes = criteriaScopePolicy.allowedCriteriaCodes.filter((code) => !pool.has(code));
    if (missingCodes.length > 0) {
      return apiError({
        status: 422,
        code: "GRADE_REQUIRED_CRITERIA_MISSING",
        userMessage: `Required criteria for ${brief.unit.unitCode} ${brief.assignmentCode} (${criteriaScopePolicy.loLabel}) are missing from mapping/spec: ${missingCodes.join(", ")}.`,
        route: "/api/submissions/[submissionId]/grade",
        requestId,
        details: {
          submissionId,
          briefId: brief.id,
          policyCode: criteriaScopePolicy.policyCode,
          missingCodes,
          mappedCriteriaCodes: criteriaFromMap.map((c) => String(c.code || "").trim().toUpperCase()).filter(Boolean),
        },
      });
    }
    criteria = criteriaScopePolicy.ignoreManualExclusions
      ? scopedCriteria
      : scopedCriteria.filter((c) => !excludedCriteriaSet.has(String(c.code || "").trim().toUpperCase()));
  }
  const scopeExcludedIgnoredCodes = criteriaScopePolicy?.ignoreManualExclusions
    ? criteriaScopePolicy.allowedCriteriaCodes.filter((code) => excludedCriteriaSet.has(code))
    : [];

  if (!criteria.length) {
    return apiError({
      status: 422,
      code: "GRADE_NO_ACTIVE_CRITERIA",
      userMessage: "All brief criteria are excluded from grading. Re-enable at least one criterion in Brief Library.",
      route: "/api/submissions/[submissionId]/grade",
      requestId,
      details: { submissionId, briefId: brief.id, excludedCriteriaCodes },
    });
  }
  const criteriaCodes = Array.from(new Set(criteria.map((c) => String(c.code || "").trim().toUpperCase()).filter(Boolean)));
  let briefCriteriaCodes = pickBriefCriteriaCodes(brief.briefDocument?.extractedJson).filter(
    (code) => !excludedCriteriaSet.has(String(code || "").trim().toUpperCase())
  );
  if (criteriaScopePolicy) {
    const allowed = new Set(criteriaScopePolicy.allowedCriteriaCodes);
    briefCriteriaCodes = briefCriteriaCodes.filter((code) => allowed.has(code));
  }
  const criteriaAlignment = compareCriteriaAlignment(criteriaCodes, briefCriteriaCodes);
  const minAlignmentRatio = Math.max(0.3, Math.min(0.95, Number(process.env.GRADE_MAPPING_ALIGNMENT_MIN_RATIO || 0.65)));
  const mismatchThreshold = Math.max(1, Math.min(8, Number(process.env.GRADE_MAPPING_MISMATCH_MAX || 2)));
  const mappingMismatchBlocked =
    briefCriteriaCodes.length >= 2 &&
    criteriaAlignment.mismatchCount >= mismatchThreshold &&
    criteriaAlignment.overlapRatio < minAlignmentRatio;
  if (mappingMismatchBlocked) {
    appendOpsEvent({
      type: "GRADE_BLOCKED_MAPPING_MISMATCH",
      actor,
      route: "/api/submissions/[submissionId]/grade",
      status: 422,
      details: {
        requestId,
        submissionId,
        briefId: brief.id,
        assignmentCode: brief.assignmentCode,
        excludedCriteriaCodes,
        mismatchCount: criteriaAlignment.mismatchCount,
        overlapRatio: criteriaAlignment.overlapRatio,
        missingInMap: criteriaAlignment.missingInMap,
        extraInMap: criteriaAlignment.extraInMap,
      },
    });
    return apiError({
      status: 422,
      code: "GRADE_CRITERIA_MAPPING_MISMATCH",
      userMessage: "Brief extracted criteria and mapped criteria are out of sync. Re-lock brief mapping before grading.",
      route: "/api/submissions/[submissionId]/grade",
      requestId,
      details: {
        submissionId,
        briefId: brief.id,
        assignmentCode: brief.assignmentCode,
        excludedCriteriaCodes,
        mappedCriteriaCodes: criteriaAlignment.mapped,
        briefCriteriaCodes: criteriaAlignment.brief,
        missingInMap: criteriaAlignment.missingInMap,
        extraInMap: criteriaAlignment.extraInMap,
        overlapRatio: criteriaAlignment.overlapRatio,
        mismatchCount: criteriaAlignment.mismatchCount,
      },
    });
  }

  const rubricAttachment = (brief.briefDocument?.sourceMeta as any)?.rubricAttachment || null;
  const rubricSupport = await resolveRubricSupportContext({
    useRubric,
    rubricAttachment,
    criteriaCodes,
    briefSupportNotes: normalizeText((brief.briefDocument?.sourceMeta as any)?.rubricSupportNotes || ""),
  });
  const rubricHint = rubricSupport.hint;
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
  const extractionConfidence = Number(extractionGate.metrics?.overallConfidence || 0);
  const extractionConfidenceScore = Number.isFinite(extractionConfidence)
    ? Math.max(0, Math.min(1, extractionConfidence))
    : 0;
  const submissionFilenameLower = String(submission?.filename || "").toLowerCase();
  const submissionPathLower = String(submission?.storagePath || "").toLowerCase();
  const isPdfSubmission = submissionFilenameLower.endsWith(".pdf") || submissionPathLower.endsWith(".pdf");
  const gradingInputStrategy = chooseGradingInputStrategy({
    requestedMode: process.env.GRADE_INPUT_MODE || "auto",
    isPdf: isPdfSubmission,
    extractionMode,
    coverReady,
    extractionGateOk: extractionGate.ok,
    extractedChars: Number(extractionGate.metrics?.extractedChars || 0),
    extractionConfidence: extractionConfidenceScore,
    minExtractedChars: safeEnvInt("GRADE_INPUT_MIN_EXTRACTED_CHARS", 2200, 300, 200000),
    minExtractionConfidence: safeEnvNumber("GRADE_INPUT_MIN_EXTRACTION_CONFIDENCE", 0.84, 0.55, 0.99),
  });
  let gradingInputMode = gradingInputStrategy.mode;
  const gradingInputWarnings: string[] = [];
  let rawPdfPageInput: Array<{ pageNumber: number; imageDataUrl: string }> = [];
  let rawPdfPageCount = 0;
  let rawPdfPagesUsed = 0;
  if (gradingInputMode === "RAW_PDF_IMAGES") {
    try {
      const rawMaxPages = safeEnvInt("GRADE_RAW_MAX_PAGES", 18, 1, 80);
      const rawScale = safeEnvNumber("GRADE_RAW_RENDER_SCALE", 1.45, 1, 3);
      const rendered = await renderPdfPagesForGrading({
        pdfPath: submission.storagePath,
        maxPages: rawMaxPages,
        scale: rawScale,
      });
      rawPdfPageInput = rendered.pages;
      rawPdfPageCount = rendered.pageCount;
      rawPdfPagesUsed = rendered.usedPages;
      if (rendered.warnings.length) gradingInputWarnings.push(...rendered.warnings);
      if (!rawPdfPageInput.length) {
        throw new Error("No raw PDF pages could be rendered.");
      }
    } catch (e: any) {
      gradingInputWarnings.push(`Raw PDF render failed: ${String(e?.message || e)}`);
      if (extractionGate.ok) {
        gradingInputMode = "EXTRACTED_TEXT";
        gradingInputWarnings.push("Falling back to extracted input because raw rendering failed.");
      } else {
        return apiError({
          status: 422,
          code: "GRADE_RAW_INPUT_UNAVAILABLE",
          userMessage:
            "Adaptive grading chose raw PDF mode, but raw document rendering failed and extraction is not ready.",
          route: "/api/submissions/[submissionId]/grade",
          requestId,
          details: {
            submissionId,
            strategy: gradingInputStrategy,
            rawWarnings: gradingInputWarnings,
            extractionGate,
          },
        });
      }
    }
  }
  if (gradingInputMode === "EXTRACTED_TEXT" && !extractionGate.ok) {
    return apiError({
      status: 422,
      code: "GRADE_EXTRACTION_NOT_READY",
      userMessage: "Extraction quality gate failed. Review extraction/OCR before grading.",
      route: "/api/submissions/[submissionId]/grade",
      requestId,
      details: {
        submissionId,
        strategy: gradingInputStrategy,
        blockers: extractionGate.blockers,
        warnings: extractionGate.warnings,
        metrics: extractionGate.metrics,
      },
    });
  }
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
  const pageContext =
    gradingInputMode === "EXTRACTED_TEXT"
      ? buildPageSampleContext(
          sampledPages,
          Math.max(500, Math.min(6000, Number(process.env.OPENAI_GRADE_PAGE_SAMPLE_CHAR_LIMIT || 1600))),
          Math.max(1, Math.min(6, Number(process.env.OPENAI_GRADE_PAGE_SAMPLE_COUNT || 4)))
        )
      : `Raw PDF page images attached: ${rawPdfPagesUsed}/${Math.max(rawPdfPageCount, rawPdfPagesUsed)}.`;
  const sampledPageText = sampledPages
    .map((p) => normalizeText(p.text))
    .filter(Boolean)
    .join("\n\n");
  const modalityEvidenceText = [String(submission.extractedText || ""), sampledPageText].filter(Boolean).join("\n\n");
  const submissionCompliance = assessSubmissionCompliancePolicy({
    unitCode: String(brief.unit?.unitCode || ""),
    assignmentCode: String(brief.assignmentCode || ""),
    textCorpus: modalityEvidenceText,
  });
  const modalityEvidenceSource =
    gradingInputMode === "RAW_PDF_IMAGES"
      ? "RAW_PDF_IMAGES_PLUS_EXTRACTED_HINTS"
      : "BODY_PLUS_PAGE_SAMPLES";
  const inputCharLimit = Math.max(4000, Math.min(120000, Number(process.env.OPENAI_GRADE_INPUT_CHAR_LIMIT || 18000)));
  const configuredMaxOutputTokens = Math.max(500, Math.min(4000, Number(process.env.OPENAI_GRADE_MAX_OUTPUT_TOKENS || 1100)));
  const criteriaDrivenMinOutputTokens = Math.max(900, Math.min(3800, 500 + criteriaCodes.length * 140));
  const maxOutputTokens = Math.max(configuredMaxOutputTokens, criteriaDrivenMinOutputTokens);
  const bodyFallbackText =
    gradingInputMode === "EXTRACTED_TEXT"
      ? String(submission.extractedText || "").slice(0, inputCharLimit) ||
        "(No substantial extracted body text available. Use evidence-based caution.)"
      : String(submission.extractedText || "").slice(0, Math.max(1500, Math.min(8000, Math.floor(inputCharLimit / 2)))) ||
        "(Extraction hints unavailable. Use attached PDF pages as primary source.)";
  const submissionAssessmentEvidence = detectSubmissionAssessmentEvidence(modalityEvidenceText);
  const readableEvidenceLikely = inferReadableSubmissionEvidence({
    textCorpus: modalityEvidenceText,
    sampledPagesCount: sampledPages.length,
    extractedChars: Number(extractionGate.metrics?.extractedChars || 0),
    rawPdfPagesUsed,
    submissionAssessmentEvidence,
  });
  const handwritingLikely = inferHandwritingLikely({
    submissionFilename: String(submission.filename || ""),
    textCorpus: modalityEvidenceText,
    isPdfSubmission,
    extractionMode,
    gradingInputMode,
    extractionConfidence: extractionConfidenceScore,
    extractedChars: Number(extractionGate.metrics?.extractedChars || 0),
    submissionAssessmentEvidence,
  });
  const modalityCompliance = evaluateModalityCompliance(assessmentRequirements, submissionAssessmentEvidence);
  const readinessChecklist = {
    extractionCompleteness: gradingInputMode === "RAW_PDF_IMAGES" ? true : extractionGate.ok,
    studentLinked: !!submission.studentId,
    assignmentLinked: !!submission.assignmentId,
    lockedReferencesAvailable: !!brief.lockedAt && !!brief.unit?.lockedAt,
    resubmissionStatusVerified: true,
  };
  const referenceContextSnapshot = {
    capturedAt: new Date().toISOString(),
    submissionId: submission.id,
    submissionPageCount: Number(submission.extractionRuns?.[0]?.pageCount || 0),
    unit: {
      id: brief.unit.id,
      unitCode: brief.unit.unitCode,
      unitTitle: brief.unit.unitTitle,
      status: brief.unit.status,
      lockedAt: brief.unit.lockedAt?.toISOString?.() || null,
      specIssue: brief.unit.specIssue || null,
      specVersionLabel: brief.unit.specVersionLabel || null,
    },
    specDocument: brief.unit.specDocumentId
      ? {
          id: brief.unit.specDocumentId,
          title: brief.unit.specDocument?.title || null,
          version: brief.unit.specDocument?.version || null,
          status: brief.unit.specDocument?.status || null,
          issueLabel:
            brief.unit.specVersionLabel ||
            brief.unit.specIssue ||
            ((brief.unit.specDocument?.sourceMeta as any)?.specVersionLabel || (brief.unit.specDocument?.sourceMeta as any)?.specIssue || null),
          lockedAt: brief.unit.specDocument?.lockedAt?.toISOString?.() || null,
        }
      : null,
    assignmentBrief: {
      id: brief.id,
      assignmentCode: brief.assignmentCode,
      title: brief.title,
      status: brief.status,
      lockedAt: brief.lockedAt?.toISOString?.() || null,
      excludedCriteriaCodes,
      briefDocument: brief.briefDocumentId
        ? {
            id: brief.briefDocumentId,
            title: brief.briefDocument?.title || null,
            version: brief.briefDocument?.version || null,
            status: brief.briefDocument?.status || null,
            lockedAt: brief.briefDocument?.lockedAt?.toISOString?.() || null,
          }
        : null,
    },
    criteriaUsed: criteria.map((c) => ({
      criterionId: String((c as any).criterionId || ""),
      code: String(c.code || ""),
      band: String(c.band || ""),
      lo: String(c.lo || ""),
      description: String(c.description || ""),
    })),
  };
  const gradingDefaultsSnapshot = {
    tone,
    noteToneKey: noteToneProfile.key,
    strictness,
    useRubricIfAvailable: useRubric,
    model: activeModel,
    feedbackTemplateHash: createHash("sha256").update(String(feedbackTemplate || "")).digest("hex"),
    feedbackTemplateScope: feedbackTemplateResolution.scope,
    feedbackTemplateUserId: feedbackTemplateResolution.userId,
    resubmissionCapRuleActive: ["1", "true", "yes", "on"].includes(
      String(process.env.GRADE_RESUBMISSION_CAP_ENABLED || "false").toLowerCase()
    ),
  };
  const assignmentSpecificPromptRules = buildAssignmentSpecificPromptRules({
    unitCode: String(brief.unit?.unitCode || ""),
    assignmentCode: String(brief.assignmentCode || ""),
  });

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
    "- Do not mark a criterion as ACHIEVED if your rationale indicates missing/insufficient/unclear evidence.",
    "- If the brief requires tables/charts/images/equations, explicitly evaluate whether the submission includes them with usable evidence and reference that in evidence/comments.",
    "- Missing required charts/images/equations/tables must reduce criterion attainment and overall grade confidence.",
    "- Write student-facing feedback in warm, human, professional UK English. Prefer direct second-person phrasing ('you' / 'your').",
    "- Keep feedbackSummary concise (2-4 sentences) and do not repeat the grade label if already stated elsewhere.",
    "- Do not repeat the same strength/gap in both feedbackSummary and feedbackBullets using near-identical wording.",
    "- feedbackBullets should be distinct points (no duplicates or rephrasings of the same point).",
    "- Include page references in feedbackBullets where possible (e.g. 'pages 2-4') so evidence is easy to verify.",
    "- State the key higher-band gap once, clearly, instead of repeating it multiple times.",
    ...assignmentSpecificPromptRules,
    "",
    "Input routing strategy:",
    `- Mode: ${gradingInputMode}`,
    `- Reason: ${gradingInputStrategy.reason}`,
    ...(gradingInputWarnings.length
      ? ["- Strategy warnings:", ...gradingInputWarnings.slice(0, 8).map((w) => `  - ${w}`)]
      : []),
    "",
    "Assignment context:",
    `Unit: ${brief.unit.unitCode} ${brief.unit.unitTitle}`,
    `Assignment code: ${brief.assignmentCode}`,
    `Feedback addressee first name: ${studentFirstName || "Unknown (infer if possible)"}`,
    rubricHint,
    rubricSupport.promptContext,
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
    "Criteria mapping snapshot (for audit traceability):",
    JSON.stringify(
      {
        excludedCriteriaCodes,
        mappedCriteriaCodes: criteriaAlignment.mapped,
        briefExtractedCriteriaCodes: criteriaAlignment.brief,
        overlapRatio: criteriaAlignment.overlapRatio,
      },
      null,
      2
    ),
    "",
    "Student submission page samples (supporting evidence):",
    pageContext,
    "",
    gradingInputMode === "RAW_PDF_IMAGES"
      ? "Submission extracted body text (secondary hint only; may be incomplete):"
      : "Submission extracted body text (primary context):",
    bodyFallbackText,
  ].join("\n");
  const promptHash = createHash("sha256").update(prompt).digest("hex");
  const inputStrategySnapshot = {
    requestedMode: gradingInputStrategy.requestedMode,
    mode: gradingInputMode,
    reason: gradingInputStrategy.reason,
    thresholds: gradingInputStrategy.usedThresholds,
    extractionGateOk: extractionGate.ok,
    extractionMode: extractionMode || "UNKNOWN",
    extractedChars: Number(extractionGate.metrics?.extractedChars || 0),
    extractionConfidence: extractionConfidenceScore,
    rawPdfPagesUsed,
    rawPdfPageCount,
    warnings: gradingInputWarnings,
  };
  const modelInput =
    gradingInputMode === "RAW_PDF_IMAGES"
      ? [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              ...rawPdfPageInput.flatMap((p) => [
                { type: "input_text", text: `Submission page ${p.pageNumber}` },
                { type: "input_image", image_url: p.imageDataUrl },
              ]),
            ],
          },
        ]
      : prompt;

  if (!dryRun) {
    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "ASSESSING" },
    });
  }

  try {
    const buildRequestBody = (modelName: string) =>
      JSON.stringify({
        model: modelName,
        input: modelInput as any,
        ...buildResponsesTemperatureParam(modelName, 0.2),
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
      });

    const fetchGradingResponse = (modelName: string) =>
      fetchOpenAiJson(
        "/v1/responses",
        apiKey,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: buildRequestBody(modelName),
        },
        {
          timeoutMs: Number(process.env.OPENAI_GRADE_TIMEOUT_MS || 90000),
          retries: Number(process.env.OPENAI_GRADE_RETRIES || 3),
        }
      );

    let usedModel = activeModel;
    let response = await fetchGradingResponse(usedModel);
    if (
      !response.ok &&
      isModelVerificationBlocked(response.message, usedModel) &&
      fallbackModel &&
      fallbackModel !== usedModel
    ) {
      const fallbackResponse = await fetchGradingResponse(fallbackModel);
      if (fallbackResponse.ok) {
        response = fallbackResponse;
        usedModel = fallbackModel;
        gradingDefaultsSnapshot.model = usedModel;
      } else {
        throw new Error(`${response.message} | Fallback ${fallbackModel} failed: ${fallbackResponse.message}`);
      }
    }

    if (!response.ok) throw new Error(response.message);
    let json = response.json;
    let usage = json?.usage || null;
    if (usage) {
      recordOpenAiUsage({
        model: usedModel,
        op: "submission_grade",
        usage,
      });
    }

    let parsed = extractStructuredModelJson(json) || {};
    let validated = validateGradeDecision(parsed, criteriaCodes);
    const schemaRetryLimit = safeEnvInt("OPENAI_GRADE_SCHEMA_RETRIES", 1, 0, 3);
    let schemaValidationRetryCount = 0;

    while (!validated.ok && schemaValidationRetryCount < schemaRetryLimit) {
      schemaValidationRetryCount += 1;
      const retryResponse = await fetchGradingResponse(usedModel);
      if (!retryResponse.ok) break;
      json = retryResponse.json;
      const retryUsage = json?.usage || null;
      if (retryUsage) {
        usage = retryUsage;
        recordOpenAiUsage({
          model: usedModel,
          op: "submission_grade_schema_retry",
          usage: retryUsage,
        });
      }
      parsed = extractStructuredModelJson(json) || {};
      validated = validateGradeDecision(parsed, criteriaCodes);
    }

    let schemaFallbackUsed = false;
    let decision;
    if (!validated.ok) {
      schemaFallbackUsed = true;
      decision = {
        overallGradeWord: "REFER" as const,
        overallGrade: "REFER" as const,
        resubmissionRequired: true,
        feedbackSummary:
          "Your work could not be graded reliably from the available evidence.",
        feedbackBullets: [
          "Please review the assignment requirements and ensure each criterion is evidenced clearly.",
          "Resubmit with explicit evidence across the required tasks and outcomes.",
          "Your assessor can provide additional guidance on the areas to strengthen.",
        ],
        criterionChecks: criteriaCodes.map((code) => ({
          code,
          decision: "UNCLEAR" as const,
          rationale: "Insufficient reliable evidence captured for a confident criterion decision.",
          confidence: 0.25,
          evidence: [{ page: 1, visualDescription: "Evidence could not be validated for this criterion." }],
        })),
        confidence: 0.25,
      };
    } else {
      decision = validated.data;
    }
    const decisionGuard = enforceBriefCriterionDecisionGuards({
      unitCode: String(brief.unit?.unitCode || ""),
      assignmentCode: String(brief.assignmentCode || ""),
      decision,
    });
    decision = decisionGuard.decision;
    const recentAssessments = await prisma.assessment.findMany({
      where: { submissionId: submission.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        createdAt: true,
        overallGrade: true,
        resultJson: true,
      },
    });
    const previousAssessment = recentAssessments[0] || null;
    const overrideSourceAssessment =
      recentAssessments.find((row) => extractAssessorOverridesFromAssessmentResult((row?.resultJson as any) || {}).length > 0) ||
      null;
    let carriedOverrideRows: any[] = [];
    let carriedOverrideSummary: {
      appliedCount: number;
      reasonCodes: string[];
      changedCodes: string[];
      lastUpdatedAt: string | null;
      carriedFromAssessmentId: string | null;
      carriedFromCreatedAt: string | null;
    } | null = null;
    if (overrideSourceAssessment) {
      const sourceOverrides = extractAssessorOverridesFromAssessmentResult((overrideSourceAssessment.resultJson as any) || {});
      const carried = applyCarriedAssessorOverridesToCriterionChecks(decision.criterionChecks as any[], sourceOverrides as any);
      if (carried.appliedCount > 0) {
        decision = {
          ...decision,
          criterionChecks: carried.rows as any,
        };
        carriedOverrideRows = carried.overrideRows as any[];
        carriedOverrideSummary = {
          appliedCount: carried.appliedCount,
          reasonCodes: Array.from(new Set(carried.overrideRows.map((r: any) => String(r.reasonCode || ""))))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b)),
          changedCodes: carried.appliedCodes,
          lastUpdatedAt: String(carried.overrideRows[carried.overrideRows.length - 1]?.updatedAt || "") || null,
          carriedFromAssessmentId: overrideSourceAssessment.id,
          carriedFromCreatedAt: overrideSourceAssessment.createdAt?.toISOString?.() || null,
        };
      }
    }
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

    const criteriaCompletionGrade = deriveGradeFromCriteriaCompletion(
      decision.criterionChecks as any,
      criteria as any
    );
    const rawGradeForBandCap =
      carriedOverrideRows.length > 0
        ? maxGradeBand(decision.overallGradeWord, criteriaCompletionGrade)
        : decision.overallGradeWord;
    const bandCapPolicy = applyBandCompletionCap(
      rawGradeForBandCap,
      decision.criterionChecks as any,
      criteria as any
    );
    const assignmentGradeConsistency = applyAssignmentGradeConsistency({
      unitCode: String(brief.unit?.unitCode || ""),
      assignmentCode: String(brief.assignmentCode || ""),
      grade: bandCapPolicy.finalGrade,
      criterionChecks: decision.criterionChecks as any,
    });
    const gradePolicy = applyResubmissionCap(
      assignmentGradeConsistency.grade,
      Boolean(decision.resubmissionRequired),
      gradingDefaultsSnapshot.resubmissionCapRuleActive
    );
    const rawOverallGrade = gradePolicy.rawGrade;
    const overallGrade = gradePolicy.finalGrade;
    const confidenceCap = Math.max(
      0.2,
      Math.min(0.95, Number(process.env.GRADE_MODALITY_MISSING_CONFIDENCE_CAP || 0.65))
    );
    const modelConfidenceRaw = Number(decision.confidence);
    const modelConfidence = Number.isFinite(modelConfidenceRaw)
      ? Math.max(0, Math.min(1, modelConfidenceRaw))
      : 0.5;
    const evidenceDensityByCriterion = buildEvidenceDensityByCriterion(decision.criterionChecks);
    const evidenceDensitySummary = {
      criteriaCount: evidenceDensityByCriterion.length,
      totalCitations: evidenceDensityByCriterion.reduce((sum, row) => sum + Number(row.citationCount || 0), 0),
      totalWordsCited: evidenceDensityByCriterion.reduce((sum, row) => sum + Number(row.totalWordsCited || 0), 0),
      criteriaWithoutEvidence: evidenceDensityByCriterion.filter((row) => Number(row.citationCount || 0) === 0).length,
    };
    const modalityMissingCountForConfidence =
      gradingInputMode === "RAW_PDF_IMAGES" ? 0 : modalityCompliance.missingCount;
    const confidenceResult = computeGradingConfidence({
      modelConfidence,
      extractionConfidence: extractionConfidenceScore,
      extractionMode,
      modalityMissingCount: modalityMissingCountForConfidence,
      readinessChecklist,
      criteriaAlignmentOverlapRatio: criteriaAlignment.overlapRatio,
      criteriaAlignmentMismatchCount: criteriaAlignment.mismatchCount,
      criterionChecks: decision.criterionChecks,
      evidenceDensitySummary,
      modalityMissingCap: confidenceCap,
      bandCapWasCapped: bandCapPolicy.wasCapped,
    });
    const finalConfidence = confidenceResult.finalConfidence;
    const templateLooksLikeItGreetsStudent =
      /\{studentFirstName\}|\{studentFullName\}|(?:^|\n)\s*hello\b/i.test(String(feedbackTemplate || ""));
    const feedbackSummaryRaw = templateLooksLikeItGreetsStudent
      ? stripLeadingStudentAddress(String(decision.feedbackSummary || ""), studentFirstName)
      : personalizeFeedbackSummary(decision.feedbackSummary, studentFirstName);
    const feedbackSummary = buildFriendlyFeedbackSummary({
      unitCode: String(brief.unit?.unitCode || ""),
      assignmentCode: String(brief.assignmentCode || ""),
      overallGrade,
      feedbackSummary: feedbackSummaryRaw,
      criterionChecks: decision.criterionChecks,
      readableEvidenceLikely,
      noteToneProfile,
    });
    const baseFeedbackBulletsRaw = sanitizeStudentFeedbackBullets(decision.feedbackBullets, cfg.maxFeedbackBullets);
    const baseFeedbackBullets = readableEvidenceLikely
      ? baseFeedbackBulletsRaw.filter((line) => !containsBlankContentClaim(line))
      : baseFeedbackBulletsRaw;
    const higherGradeGapBullets = buildHigherGradeGapBullets({
      finalGrade: overallGrade,
      rawGrade: rawOverallGrade,
      gradePolicy,
      bandCapPolicy,
      criterionChecks: decision.criterionChecks,
    });
    const criterionSpecificFeedbackBullets = buildCriterionSpecificFeedbackBullets({
      unitCode: String(brief.unit?.unitCode || ""),
      assignmentCode: String(brief.assignmentCode || ""),
      criterionChecks: decision.criterionChecks,
      submissionCompliance,
      handwritingLikely,
      readableEvidenceLikely,
      noteToneProfile,
    });
    const feedbackBullets = dedupeFeedbackBullets({
      bullets: [...baseFeedbackBullets, ...higherGradeGapBullets, ...criterionSpecificFeedbackBullets]
        .map((line) => sanitizeStudentFeedbackLine(line))
        .filter(Boolean),
      summary: feedbackSummary,
      max: Math.max(1, cfg.maxFeedbackBullets),
    });
    const systemNotes: string[] = [];
    if (carriedOverrideSummary && carriedOverrideSummary.appliedCount > 0) {
      systemNotes.push(
        `Carried forward ${carriedOverrideSummary.appliedCount} assessor override(s) from prior assessment ${carriedOverrideSummary.carriedFromAssessmentId} (${carriedOverrideSummary.changedCodes.join(", ")}).`
      );
    }
    if (criteriaScopePolicy) {
      systemNotes.push(
        `Criteria scope policy applied (${criteriaScopePolicy.policyCode}): grading constrained to ${criteriaScopePolicy.allowedCriteriaCodes.join(", ")}.`
      );
      if (scopeExcludedIgnoredCodes.length > 0) {
        systemNotes.push(
          `Ignored manual exclusions for required scoped criteria: ${scopeExcludedIgnoredCodes.join(", ")}.`
        );
      }
    }
    if (decisionGuard.notes.length) {
      systemNotes.push(...decisionGuard.notes);
    }
    if (readableEvidenceLikely && containsBlankContentClaim(decision.feedbackSummary)) {
      systemNotes.push("Adjusted student-facing summary because readable page evidence conflicted with a blank-content claim.");
    }
    if (schemaValidationRetryCount > 0) {
      systemNotes.push(
        schemaFallbackUsed
          ? `Model output schema validation failed after ${schemaValidationRetryCount} retry attempt(s); fallback decision was used.`
          : `Model output schema validation retry succeeded after ${schemaValidationRetryCount} attempt(s).`
      );
    }
    if (modalityCompliance.missingCount > 0 && gradingInputMode !== "RAW_PDF_IMAGES") {
      const modalityCapApplied = confidenceResult.capsApplied.some((c) => c.name === "modality_missing_cap");
      systemNotes.push(
        modalityCapApplied
          ? `Required modality evidence missing in ${modalityCompliance.missingCount} task section(s); confidence capped at ${finalConfidence.toFixed(2)}.`
          : `Required modality evidence missing in ${modalityCompliance.missingCount} task section(s); confidence adjusted to ${finalConfidence.toFixed(2)}.`
      );
    } else if (modalityCompliance.missingCount > 0 && gradingInputMode === "RAW_PDF_IMAGES") {
      systemNotes.push(
        `Modality heuristic flagged ${modalityCompliance.missingCount} missing section(s), but confidence penalty was skipped because raw PDF image grading mode was used.`
      );
    }
    if (extractionMode === "COVER_ONLY") {
      systemNotes.push("Cover-only extraction mode was active; grading relied primarily on sampled page evidence.");
    }
    if (gradingInputMode === "RAW_PDF_IMAGES") {
      systemNotes.push(
        `Adaptive input routing used RAW_PDF_IMAGES (${rawPdfPagesUsed}/${Math.max(rawPdfPageCount, rawPdfPagesUsed)} pages).`
      );
      if (gradingInputWarnings.length) {
        systemNotes.push(...gradingInputWarnings.slice(0, 5).map((w) => `Input strategy warning: ${w}`));
      }
    } else {
      systemNotes.push("Adaptive input routing used EXTRACTED_TEXT.");
    }
    if (bandCapPolicy.wasCapped) {
      systemNotes.push(`Grade adjusted by criteria-band completion policy (${String(bandCapPolicy.capReason || "unknown")}).`);
    }
    if (assignmentGradeConsistency.note) {
      systemNotes.push(assignmentGradeConsistency.note);
    }
    if (gradePolicy.wasCapped) {
      systemNotes.push("Grade capped due to resubmission policy.");
    }
    if (submissionCompliance?.status === "RETURN_REQUIRED") {
      systemNotes.push(
        `Submission compliance action required (${submissionCompliance.policyCode}): ${submissionCompliance.issues.join(" ")}`
      );
    }
    if (useRubric) {
      if (rubricSupport.meta.criteriaHintsCount > 0) {
        systemNotes.push(
          `Rubric guidance applied across criteria (${rubricSupport.meta.criteriaHintsCount} criterion hints).`
        );
      } else if (rubricSupport.meta.attachmentDetected) {
        systemNotes.push("Rubric attachment detected but criterion-level hints were not available.");
      }
      if (Array.isArray(rubricSupport.meta.warnings) && rubricSupport.meta.warnings.length) {
        systemNotes.push(...rubricSupport.meta.warnings.slice(0, 2).map((w: string) => `Rubric warning: ${w}`));
      }
    }
    if (usedModel !== activeModel) {
      systemNotes.push(`Model fallback applied: requested ${activeModel}, used ${usedModel}.`);
    }
    const responseWithPolicy = {
      ...decision,
      overallGradeWord: overallGrade,
      overallGrade,
      confidence: finalConfidence,
      rawOverallGradeWord: rawOverallGrade,
      feedbackSummary,
      feedbackBullets,
      gradePolicy,
      submissionCompliance,
    };
    const completedAtIso = new Date().toISOString();
    const structuredGradingV2 = buildStructuredGradingV2(responseWithPolicy, {
      contractVersion: "v2-structured-evidence",
      promptHash,
      model: usedModel,
      gradedBy: actor,
      startedAtIso: gradingStartedAt.toISOString(),
      completedAtIso,
    });
    const feedbackDate = toUkDate(completedAtIso);
    const higherGradeGuidance = higherGradeGapBullets.length
      ? higherGradeGapBullets.join(" ")
      : "To progress to a higher band, make each criterion link explicit with page-based evidence.";
    const criterionOutcomeSummary = buildCriterionOutcomeSummaryBlock({
      criteria: criteria as any,
      criterionChecks: decision.criterionChecks as any,
    });
    let feedbackText = renderFeedbackTemplate({
      template: feedbackTemplate,
      studentFirstName: studentFirstName || "Student",
      studentFullName: submission?.student?.fullName || studentFirstName || "Student",
      feedbackSummary,
      feedbackBullets: feedbackBullets.length ? feedbackBullets : ["Feedback generated."],
      overallGrade,
      assessorName: actor,
      markedDate: feedbackDate,
      unitCode: String(brief.unit?.unitCode || ""),
      assignmentCode: String(brief.assignmentCode || ""),
      submissionId: String(submission.id || ""),
      confidence: finalConfidence,
      gradingTone: tone,
      gradingStrictness: strictness,
      higherGradeGuidance,
      criterionOutcomeSummary,
    });
    const feedbackClaimLint = lintOverallFeedbackClaims({
      text: feedbackText,
      criterionChecks: decision.criterionChecks as any,
      overallGrade,
    });
    feedbackText = feedbackClaimLint.text;
    if (feedbackClaimLint.changed) {
      systemNotes.push(
        `Overall feedback wording lint softened ${feedbackClaimLint.changedLines} contradictory claim line(s) for unachieved criteria.`
      );
    }
    const feedbackPearsonLint = lintOverallFeedbackPearsonPolicy({
      text: feedbackText,
      criterionChecks: decision.criterionChecks as any,
      overallGrade,
      context: {
        unitCode: String(brief.unit?.unitCode || ""),
        assignmentCode: String(brief.assignmentCode || ""),
        assignmentTitle: String(brief.title || ""),
      },
    });
    feedbackText = feedbackPearsonLint.text;
    if (feedbackPearsonLint.changed) {
      systemNotes.push(
        `Pearson feedback style lint normalized ${feedbackPearsonLint.changedLines} line adjustment(s) (grade tone/work-focus/spill guard).`
      );
    }
    const submissionPageCount = Math.max(
      0,
      Number(submission.extractionRuns?.[0]?.pageCount || rawPdfPageCount || 0)
    );
    const pageNoteContext: PageNoteGenerationContext = {
      unitCode: String(brief.unit?.unitCode || ""),
      assignmentCode: String(brief.assignmentCode || ""),
      assignmentTitle: String(brief.title || ""),
      assignmentType: String((brief as any)?.assignmentType || (brief as any)?.type || ""),
      criteriaSet: criteriaCodes,
    };
    const includeCriterionCodeInPageNotes = cfg.studentSafeMarkedPdf ? false : cfg.pageNotesIncludeCriterionCode;
    let pageNotes = cfg.pageNotesEnabled
      ? buildPageNotesFromCriterionChecks(decision.criterionChecks, {
          maxPages: cfg.pageNotesMaxPages,
          maxLinesPerPage: Math.max(8, cfg.pageNotesMaxLinesPerPage),
          tone: cfg.pageNotesTone,
          includeCriterionCode: includeCriterionCodeInPageNotes,
          totalPages: submissionPageCount,
          handwritingLikely,
          context: pageNoteContext,
        })
      : [];
    const notesAiRewriteEnvEnabled = isNotesAiRewriteEnabledByEnv();
    if (pageNotes.length && cfg.pageNotesAiPolishEnabled && notesAiRewriteEnvEnabled) {
      const notePolishModel =
        String(process.env.OPENAI_PAGE_NOTES_POLISH_MODEL || "").trim() || usedModel || activeModel;
      const polishedNotes = await maybePolishPageNotesWithAi({
        enabled: true,
        apiKey,
        model: notePolishModel,
        fallbackModel,
        tone: cfg.pageNotesTone,
        notes: pageNotes as any,
        criterionChecks: decision.criterionChecks as any,
        context: pageNoteContext,
        allowCriterionCodesInText: includeCriterionCodeInPageNotes,
      });
      if (polishedNotes.applied) {
        pageNotes = polishedNotes.notes;
        systemNotes.push(`AI page-note polish applied (${polishedNotes.replacedCount}/${pageNotes.length} notes).`);
      } else {
        systemNotes.push(
          `AI page-note polish skipped (${polishedNotes.reason}${(polishedNotes as any).error ? `: ${(polishedNotes as any).error}` : ""}).`
        );
      }
    } else if (pageNotes.length && cfg.pageNotesAiPolishEnabled && !notesAiRewriteEnvEnabled) {
      systemNotes.push("AI page-note polish skipped (NOTES_AI_REWRITE disabled).");
    }

    const previousSnapshot = (previousAssessment?.resultJson as any)?.referenceContextSnapshot || null;
    const previousCriterionChecks = extractCriterionRowsFromAssessmentResult((previousAssessment?.resultJson as any) || {});
    const decisionDiff = compareCriterionDecisionDiff(previousCriterionChecks, decision.criterionChecks as any[]);
    const rerunIntegrity = {
      previousAssessmentId: previousAssessment?.id || null,
      previousAssessmentAt: previousAssessment?.createdAt?.toISOString?.() || null,
      previousOverallGrade: previousAssessment?.overallGrade || null,
      snapshotDiff: diffReferenceSnapshots(previousSnapshot, referenceContextSnapshot),
      decisionDiff,
    };
    if (decisionDiff.changedCount > 0) {
      const directionBits: string[] = [];
      if (decisionDiff.stricterCount > 0) directionBits.push(`${decisionDiff.stricterCount} stricter`);
      if (decisionDiff.lenientCount > 0) directionBits.push(`${decisionDiff.lenientCount} lenient`);
      if (decisionDiff.lateralCount > 0) directionBits.push(`${decisionDiff.lateralCount} lateral`);
      systemNotes.push(
        `Regrade decision drift vs previous run: ${decisionDiff.changedCount} criterion change(s) (${directionBits.join(", ") || "mixed"}).`
      );
    }

    if (dryRun) {
      appendOpsEvent({
        type: "GRADE_DRY_RUN_COMPLETED",
        actor,
        route: "/api/submissions/[submissionId]/grade",
        status: 200,
        details: {
          requestId,
          submissionId,
          overallGrade,
          rawOverallGrade,
          confidence: finalConfidence,
          referenceSnapshotCaptured: true,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          dryRun: true,
          preview: {
            overallGrade,
            rawOverallGrade,
            confidence: finalConfidence,
            response: responseWithPolicy,
            checklist: readinessChecklist,
            gradePolicy: {
              rawOverallGrade,
              finalOverallGrade: overallGrade,
              resubmissionRequired: Boolean(decision.resubmissionRequired),
              wasCapped: gradePolicy.wasCapped,
              capReason: gradePolicy.capReason,
            },
            confidencePolicy: {
              mode: "weighted-v2",
              cap: confidenceCap,
              modelConfidence: confidenceResult.modelConfidence,
              extractionConfidence: confidenceResult.extractionConfidence,
              criterionAverageConfidence: confidenceResult.criterionAverageConfidence,
              evidenceScore: confidenceResult.evidenceScore,
              bonuses: confidenceResult.bonuses,
              weightedBaseConfidence: confidenceResult.weightedBaseConfidence,
              rawConfidenceBeforeCaps: confidenceResult.rawConfidenceBeforeCaps,
              finalConfidence: confidenceResult.finalConfidence,
              penalties: confidenceResult.penalties,
              capsApplied: confidenceResult.capsApplied,
              signals: confidenceResult.signals,
              wasCapped: confidenceResult.wasCapped,
            },
            inputStrategy: inputStrategySnapshot,
            evidenceDensitySummary,
            referenceContextSnapshot,
            submissionCompliance,
            presentationSignals: {
              readableEvidenceLikely,
              handwritingLikely,
            },
            rubricGuidance: rubricSupport.meta,
            gradingDefaultsSnapshot,
            extractionGate,
            rerunIntegrity,
          },
          requestId,
        },
        { headers: { "x-request-id": requestId } }
      );
    }

    let marked: { storagePath: string; absolutePath: string } | null = null;
    let markedPdfWarning: string | null = null;
    try {
      marked = await createMarkedPdf(submission.storagePath, {
        submissionId: submission.id,
        overallGrade,
        feedbackBullets: feedbackBullets.length ? feedbackBullets : [feedbackSummary || "Feedback generated."],
        feedbackText,
        studentSafe: cfg.studentSafeMarkedPdf,
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
          model: usedModel,
          gradingContractVersion: "v2-structured-evidence",
          gradeRunSchemaVersion: "2.1",
          tone,
          strictness,
          useRubric,
          rubricAttachment,
          rubricGuidance: rubricSupport.meta,
          promptHash,
          promptChars: prompt.length,
          criteriaSnapshot: {
            source: criteriaScopePolicy
              ? `assignmentScopePolicy:${criteriaScopePolicy.policyCode}`
              : criteriaFromMap.length > 0
                ? "assignmentBriefMap"
                : "unitFallback",
            scopePolicyCode: criteriaScopePolicy?.policyCode || null,
            excludedCriteriaCodes,
            mappedCriteriaCodes: criteriaAlignment.mapped,
            briefExtractedCriteriaCodes: criteriaAlignment.brief,
            intersection: criteriaAlignment.intersection,
            missingInMap: criteriaAlignment.missingInMap,
            extraInMap: criteriaAlignment.extraInMap,
            overlapRatio: criteriaAlignment.overlapRatio,
            mismatchCount: criteriaAlignment.mismatchCount,
            blockedByPolicy: mappingMismatchBlocked,
          },
          criteriaCount: criteria.length,
          pageSampleCount: sampledPages.length,
          extractionMode: extractionMode || "UNKNOWN",
          coverReady,
          studentFirstNameUsed: studentFirstName || null,
          feedbackTemplateUsed: feedbackTemplate,
          feedbackTemplateScopeUsed: feedbackTemplateResolution.scope,
          feedbackTemplateUserIdUsed: feedbackTemplateResolution.userId,
          feedbackRenderedDate: feedbackDate,
          pageNotesGenerated: pageNotes,
          pageNotesConfigUsed: {
            enabled: cfg.pageNotesEnabled,
            tone: cfg.pageNotesTone,
            maxPages: cfg.pageNotesMaxPages,
            maxLinesPerPage: cfg.pageNotesMaxLinesPerPage,
            includeCriterionCode: cfg.studentSafeMarkedPdf ? false : cfg.pageNotesIncludeCriterionCode,
            totalPages: submissionPageCount,
          },
          modalityEvidenceSource,
          inputStrategy: inputStrategySnapshot,
          presentationSignals: {
            readableEvidenceLikely,
            handwritingLikely,
          },
          assessmentRequirements,
          submissionAssessmentEvidence,
          modalityCompliance,
          systemNotes,
          readinessChecklist,
          referenceContextSnapshot,
          gradingDefaultsSnapshot,
          confidenceSignals: {
            extractionConfidence: extractionConfidenceScore,
            gradingConfidence: finalConfidence,
          },
          gradePolicy: {
            criteriaBandCap: bandCapPolicy,
            rawOverallGrade,
            finalOverallGrade: overallGrade,
            resubmissionRequired: Boolean(decision.resubmissionRequired),
            wasCapped: gradePolicy.wasCapped,
            capReason: gradePolicy.capReason,
          },
          submissionCompliance,
          evidenceDensityByCriterion,
          evidenceDensitySummary,
          rerunIntegrity,
          confidencePolicy: {
            mode: "weighted-v2",
            cap: confidenceCap,
            modelConfidence: confidenceResult.modelConfidence,
            extractionConfidence: confidenceResult.extractionConfidence,
            criterionAverageConfidence: confidenceResult.criterionAverageConfidence,
            evidenceScore: confidenceResult.evidenceScore,
            bonuses: confidenceResult.bonuses,
            weightedBaseConfidence: confidenceResult.weightedBaseConfidence,
            rawConfidenceBeforeCaps: confidenceResult.rawConfidenceBeforeCaps,
            finalConfidence: confidenceResult.finalConfidence,
            penalties: confidenceResult.penalties,
            capsApplied: confidenceResult.capsApplied,
            signals: confidenceResult.signals,
            wasCapped: confidenceResult.wasCapped,
          },
          assessorCriterionOverrides: carriedOverrideRows,
          assessorOverrideSummary: carriedOverrideSummary,
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

    // Best-effort Turnitin AI-writing sync when enabled in settings.
    try {
      const syncTurnitin = maybeAutoDetectAiWritingForSubmission(submission.id);
      await Promise.race([
        syncTurnitin,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
    } catch {
      // Keep grading completion successful even if Turnitin sync fails.
    }

    appendOpsEvent({
      type: "GRADE_COMPLETED",
      actor,
      route: "/api/submissions/[submissionId]/grade",
      status: 200,
      details: {
        requestId,
        submissionId,
        assessmentId: assessment.id,
        overallGrade: assessment.overallGrade,
        briefId: brief.id,
        assignmentCode: brief.assignmentCode,
        criteriaSnapshot: {
          scopePolicyCode: criteriaScopePolicy?.policyCode || null,
          excludedCriteriaCodes,
          mappedCriteriaCodes: criteriaAlignment.mapped,
          briefExtractedCriteriaCodes: criteriaAlignment.brief,
          overlapRatio: criteriaAlignment.overlapRatio,
          mismatchCount: criteriaAlignment.mismatchCount,
        },
        inputStrategy: {
          mode: gradingInputMode,
          rawPdfPagesUsed,
          rawPdfPageCount,
        },
        rerunIntegrity: {
          previousAssessmentId: rerunIntegrity.previousAssessmentId,
          driftDetected: rerunIntegrity.snapshotDiff.changed,
          driftReason: rerunIntegrity.snapshotDiff.reason,
          decisionChangedCount: rerunIntegrity.decisionDiff.changedCount,
          decisionChangedCodes: rerunIntegrity.decisionDiff.changedCodes.slice(0, 12),
        },
      },
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
    if (!dryRun) {
      await prisma.submission.update({
        where: { id: submission.id },
        data: { status: "FAILED" },
      });
    }
    appendOpsEvent({
      type: "GRADE_FAILED",
      actor,
      route: "/api/submissions/[submissionId]/grade",
      status,
      details: { requestId, submissionId, code, message: causeMessage },
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
