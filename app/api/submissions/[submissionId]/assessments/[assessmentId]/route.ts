import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMarkedPdf } from "@/lib/grading/markedPdf";
import {
  deriveBulletsFromFeedbackText,
  getDefaultFeedbackTemplate,
  renderFeedbackTemplate,
  summarizeFeedbackText,
} from "@/lib/grading/feedbackDocument";
import { readGradingConfig } from "@/lib/grading/config";
import { getCurrentAuditActor } from "@/lib/admin/appConfig";
import { buildPageNotesFromCriterionChecks, extractCriterionChecksFromResultJson } from "@/lib/grading/pageNotes";
import { sanitizeStudentFeedbackText } from "@/lib/grading/studentFeedback";

export const runtime = "nodejs";

const OVERRIDE_REASON_CODES = [
  "INSUFFICIENT_EVIDENCE",
  "RUBRIC_MISALIGNMENT",
  "CRITERION_INTERPRETATION",
  "POLICY_ALIGNMENT",
  "ASSESSOR_JUDGEMENT",
  "OTHER",
] as const;

type DecisionLabel = "ACHIEVED" | "NOT_ACHIEVED" | "UNCLEAR";

function normalizeText(v: unknown) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function normalizeDecisionLabel(value: unknown): DecisionLabel {
  const up = String(value || "").trim().toUpperCase();
  if (up === "ACHIEVED" || up === "NOT_ACHIEVED" || up === "UNCLEAR") return up;
  return "UNCLEAR";
}

function normalizeGradeBand(value: unknown): "REFER" | "PASS" | "PASS_ON_RESUBMISSION" | "MERIT" | "DISTINCTION" {
  const v = String(value || "").trim().toUpperCase();
  if (v === "DISTINCTION" || v === "MERIT" || v === "PASS" || v === "PASS_ON_RESUBMISSION") return v;
  return "REFER";
}

function applyBandCompletionCap(
  rawGradeInput: unknown,
  criterionChecks: Array<{ code?: string; decision?: string }>,
  criteria: Array<{ code?: string; band?: string }>
) {
  const rawGrade = normalizeGradeBand(rawGradeInput);
  const achieved = new Set(
    (Array.isArray(criterionChecks) ? criterionChecks : [])
      .filter((row) => normalizeDecisionLabel(row?.decision) === "ACHIEVED")
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

function extractCriteriaWithBand(resultJson: Record<string, any>) {
  const rows = Array.isArray(resultJson?.referenceContextSnapshot?.criteriaUsed)
    ? resultJson.referenceContextSnapshot.criteriaUsed
    : [];
  return rows
    .map((row: any) => ({
      code: String(row?.code || "").trim().toUpperCase(),
      band: String(row?.band || "").trim().toUpperCase(),
    }))
    .filter((row: any) => /^[PMD]\d{1,2}$/.test(row.code) && ["PASS", "MERIT", "DISTINCTION"].includes(row.band));
}

function toOverrideReasonCode(value: unknown) {
  const up = String(value || "").trim().toUpperCase();
  return (OVERRIDE_REASON_CODES as readonly string[]).includes(up) ? up : null;
}

function toUkDate(value?: string | null) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("en-GB");
  return d.toLocaleDateString("en-GB");
}

function formatCriterionCodes(codes: string[], max = 10) {
  const uniq = Array.from(
    new Set(
      (Array.isArray(codes) ? codes : [])
        .map((code) => String(code || "").trim().toUpperCase())
        .filter((code) => /^[PMD]\d{1,2}$/.test(code))
    )
  );
  if (!uniq.length) return "";
  if (uniq.length <= max) return uniq.join(", ");
  const shown = uniq.slice(0, Math.max(1, max));
  return `${shown.join(", ")} (+${uniq.length - shown.length} more)`;
}

function buildCriterionOutcomeSummary(
  checks: Array<{ code?: string; decision?: string; rationale?: string }>
) {
  const rows = Array.isArray(checks) ? checks : [];
  const achieved: string[] = [];
  const outstanding: string[] = [];
  const reasons: string[] = [];
  for (const row of rows) {
    const code = String(row?.code || "").trim().toUpperCase();
    if (!/^[PMD]\d{1,2}$/.test(code)) continue;
    const decision = normalizeDecisionLabel(row?.decision);
    if (decision === "ACHIEVED") {
      achieved.push(code);
      continue;
    }
    outstanding.push(code);
    const why = normalizeText(row?.rationale);
    if (why) reasons.push(`${code}: ${why}`);
  }

  const lines: string[] = [];
  if (achieved.length) lines.push(`Criteria achieved: ${formatCriterionCodes(achieved, 12)}.`);
  if (outstanding.length) {
    lines.push(`Criteria still to evidence clearly: ${formatCriterionCodes(outstanding, 12)}.`);
    if (reasons.length) lines.push(`Why these are still open: ${reasons.slice(0, 3).join(" ")}`);
  }
  return lines.join("\n").trim();
}

function formatNextBandRequirementLine(targetBand: "PASS" | "MERIT" | "DISTINCTION", missingCodes: string[]) {
  const shown = formatCriterionCodes(missingCodes, 12);
  if (!shown) return "";
  if (targetBand === "PASS") return `To achieve PASS, secure all Pass criteria, especially: ${shown}.`;
  if (targetBand === "MERIT") return `To reach MERIT, all Merit criteria must be achieved, including: ${shown}.`;
  return `To reach DISTINCTION, all Distinction criteria must be achieved, including: ${shown}.`;
}

function buildHigherGradeGuidance(input: {
  finalGrade: string;
  rawGrade: string;
  missing: { pass: string[]; merit: string[]; distinction: string[] };
}) {
  const finalGrade = normalizeGradeBand(input.finalGrade);
  const rawGrade = normalizeGradeBand(input.rawGrade);
  const missingPass = Array.isArray(input.missing?.pass) ? input.missing.pass : [];
  const missingMerit = Array.isArray(input.missing?.merit) ? input.missing.merit : [];
  const missingDistinction = Array.isArray(input.missing?.distinction) ? input.missing.distinction : [];

  if (finalGrade === "REFER") return formatNextBandRequirementLine("PASS", missingPass);
  if (finalGrade === "PASS" || finalGrade === "PASS_ON_RESUBMISSION") {
    if (missingMerit.length) return formatNextBandRequirementLine("MERIT", missingMerit);
    if (rawGrade === "DISTINCTION" && missingDistinction.length) {
      return formatNextBandRequirementLine("DISTINCTION", missingDistinction);
    }
    return "Maintain this standard and add stronger critical depth to progress to higher bands.";
  }
  if (finalGrade === "MERIT") {
    if (missingDistinction.length) return formatNextBandRequirementLine("DISTINCTION", missingDistinction);
    return "Merit is secure. To progress further, increase critical judgement and synthesis quality consistently.";
  }
  return "Distinction criteria are met across the mapped brief scope.";
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ submissionId: string; assessmentId: string }> }
) {
  try {
    const { submissionId, assessmentId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      feedbackText?: string;
      studentName?: string;
      markedDate?: string;
      criterionOverrides?: Array<{
        code?: string;
        finalDecision?: DecisionLabel;
        reasonCode?: string;
        note?: string;
        remove?: boolean;
      }>;
    };

    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, submissionId },
      include: { submission: { select: { id: true, storagePath: true } } },
    });
    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found for this submission." }, { status: 404 });
    }

    const gradingCfg = readGradingConfig().config;
    const resultJson = (assessment.resultJson && typeof assessment.resultJson === "object" ? assessment.resultJson : {}) as Record<string, any>;
    const tone = String(resultJson.tone || gradingCfg.tone || "professional");
    const strictness = String(resultJson.strictness || gradingCfg.strictness || "balanced");
    const actor = await getCurrentAuditActor();
    const incomingFeedback = sanitizeStudentFeedbackText(body.feedbackText);
    const hasOverrideRequest = Array.isArray(body.criterionOverrides) && body.criterionOverrides.length > 0;
    const existingFeedbackText = sanitizeStudentFeedbackText(assessment.feedbackText) || "";
    let feedbackText = incomingFeedback || existingFeedbackText || "";
    if (!feedbackText && !hasOverrideRequest) {
      return NextResponse.json({ error: "feedbackText or criterionOverrides is required." }, { status: 400 });
    }
    const markedDate = toUkDate(body.markedDate || resultJson?.feedbackOverride?.markedDate || null);
    const studentName = String(body.studentName || resultJson?.feedbackOverride?.studentName || resultJson.studentFirstNameUsed || "Student");
    const criterionChecks = extractCriterionChecksFromResultJson(resultJson);
    const criteriaWithBand = extractCriteriaWithBand(resultJson);
    const currentDecisionByCode = new Map<string, DecisionLabel>();
    const criterionRowByCode = new Map<string, any>();
    for (const row of criterionChecks) {
      const code = String(row?.code || "").trim().toUpperCase();
      if (!/^[PMD]\d{1,2}$/.test(code)) continue;
      currentDecisionByCode.set(code, normalizeDecisionLabel(row?.decision));
      criterionRowByCode.set(code, row);
    }

    const existingOverrides = Array.isArray(resultJson?.assessorCriterionOverrides)
      ? resultJson.assessorCriterionOverrides
      : [];
    const overrideMap = new Map<
      string,
      {
        code: string;
        modelDecision: DecisionLabel;
        finalDecision: DecisionLabel;
        reasonCode: string;
        note: string;
        updatedAt: string;
        updatedBy: string;
      }
    >();
    for (const raw of existingOverrides) {
      const code = String(raw?.code || "").trim().toUpperCase();
      if (!/^[PMD]\d{1,2}$/.test(code)) continue;
      const reasonCode = toOverrideReasonCode(raw?.reasonCode);
      if (!reasonCode) continue;
      overrideMap.set(code, {
        code,
        modelDecision: normalizeDecisionLabel(raw?.modelDecision),
        finalDecision: normalizeDecisionLabel(raw?.finalDecision),
        reasonCode,
        note: normalizeText(raw?.note),
        updatedAt: String(raw?.updatedAt || new Date().toISOString()),
        updatedBy: String(raw?.updatedBy || actor),
      });
    }
    for (const raw of Array.isArray(body.criterionOverrides) ? body.criterionOverrides : []) {
      const code = String(raw?.code || "").trim().toUpperCase();
      if (!/^[PMD]\d{1,2}$/.test(code)) continue;
      if (raw?.remove) {
        overrideMap.delete(code);
        continue;
      }
      const reasonCode = toOverrideReasonCode(raw?.reasonCode);
      const finalDecision = normalizeDecisionLabel(raw?.finalDecision);
      if (!reasonCode) continue;
      const modelDecision = currentDecisionByCode.get(code) || "UNCLEAR";
      overrideMap.set(code, {
        code,
        modelDecision,
        finalDecision,
        reasonCode,
        note: normalizeText(raw?.note),
        updatedAt: new Date().toISOString(),
        updatedBy: actor,
      });
    }

    const effectiveCriterionChecks = criterionChecks.map((row: any) => {
      const code = String(row?.code || "").trim().toUpperCase();
      const applied = overrideMap.get(code);
      if (!applied) return row;
      const next = { ...(row || {}) };
      next.decision = applied.finalDecision;
      next.assessorOverride = {
        applied: true,
        modelDecision: applied.modelDecision,
        finalDecision: applied.finalDecision,
        reasonCode: applied.reasonCode,
        note: applied.note || null,
        updatedAt: applied.updatedAt,
        updatedBy: applied.updatedBy,
      };
      return next;
    });

    const overrideRows = Array.from(overrideMap.values()).sort((a, b) => a.code.localeCompare(b.code));
    const rawGradeFromResult =
      resultJson?.gradePolicy?.rawOverallGrade ||
      resultJson?.response?.rawOverallGradeWord ||
      resultJson?.response?.overallGradeWord ||
      assessment.overallGrade ||
      "REFER";
    const criteriaCompletionGrade = criteriaWithBand.length
      ? deriveGradeFromCriteriaCompletion(effectiveCriterionChecks as any, criteriaWithBand as any)
      : normalizeGradeBand(rawGradeFromResult);
    const rawGradeForBandCap =
      overrideRows.length > 0
        ? maxGradeBand(rawGradeFromResult, criteriaCompletionGrade)
        : rawGradeFromResult;
    const bandCap = criteriaWithBand.length
      ? applyBandCompletionCap(rawGradeForBandCap, effectiveCriterionChecks as any, criteriaWithBand as any)
      : {
          rawGrade: normalizeGradeBand(rawGradeForBandCap),
          finalGrade: normalizeGradeBand(rawGradeForBandCap),
          wasCapped: false,
          capReason: null,
          missing: { pass: [], merit: [], distinction: [] },
        };
    const resubmissionRequired = Boolean(
      resultJson?.response?.resubmissionRequired ??
        resultJson?.structuredGradingV2?.resubmissionRequired ??
        false
    );
    const resubCapEnabled =
      typeof resultJson?.gradingDefaultsSnapshot?.resubmissionCapRuleActive === "boolean"
        ? Boolean(resultJson.gradingDefaultsSnapshot.resubmissionCapRuleActive)
        : ["1", "true", "yes", "on"].includes(String(process.env.GRADE_RESUBMISSION_CAP_ENABLED || "false").toLowerCase());
    const gradePolicy = applyResubmissionCap(bandCap.finalGrade, resubmissionRequired, resubCapEnabled);
    const finalOverallGrade = gradePolicy.finalGrade;
    const overrideSummary = {
      appliedCount: overrideRows.length,
      reasonCodes: Array.from(new Set(overrideRows.map((r) => r.reasonCode))).sort((a, b) => a.localeCompare(b)),
      changedCodes: overrideRows.map((r) => r.code),
      lastUpdatedAt: overrideRows.length ? overrideRows[overrideRows.length - 1].updatedAt : null,
    };

    const shouldAutoRefreshFeedback = hasOverrideRequest && !incomingFeedback;
    const criterionOutcomeSummary = buildCriterionOutcomeSummary(effectiveCriterionChecks as any);
    const higherGradeGuidance = buildHigherGradeGuidance({
      finalGrade: finalOverallGrade,
      rawGrade: gradePolicy.rawGrade,
      missing: bandCap.missing,
    });
    let feedbackSummaryForPayload =
      normalizeText(resultJson?.response?.feedbackSummary) ||
      summarizeFeedbackText(existingFeedbackText || feedbackText || "Feedback generated.");
    let feedbackBulletsForPayload =
      Array.isArray(resultJson?.response?.feedbackBullets) &&
      resultJson.response.feedbackBullets.some((b: unknown) => normalizeText(b))
        ? resultJson.response.feedbackBullets.map((b: unknown) => normalizeText(b)).filter(Boolean)
        : deriveBulletsFromFeedbackText(existingFeedbackText || feedbackText || "Feedback generated.", gradingCfg.maxFeedbackBullets);
    if (shouldAutoRefreshFeedback) {
      const template = String(resultJson?.feedbackTemplateUsed || getDefaultFeedbackTemplate());
      const studentFirstName = String(studentName || "Student")
        .trim()
        .split(/\s+/)
        .filter(Boolean)[0] || "Student";
      feedbackText = renderFeedbackTemplate({
        template,
        studentFirstName,
        studentFullName: String(studentName || "").trim() || studentFirstName,
        feedbackSummary: feedbackSummaryForPayload || "Feedback generated.",
        feedbackBullets: feedbackBulletsForPayload.length ? feedbackBulletsForPayload : ["Feedback generated."],
        overallGrade: finalOverallGrade,
        assessorName: actor,
        markedDate,
        unitCode: String(resultJson?.referenceContextSnapshot?.unit?.unitCode || ""),
        assignmentCode: String(resultJson?.referenceContextSnapshot?.assignmentBrief?.assignmentCode || ""),
        submissionId,
        confidence:
          typeof resultJson?.response?.confidence === "number"
            ? Number(resultJson.response.confidence)
            : typeof resultJson?.structuredGradingV2?.confidence === "number"
              ? Number(resultJson.structuredGradingV2.confidence)
              : null,
        gradingTone: tone,
        gradingStrictness: strictness,
        higherGradeGuidance,
        criterionOutcomeSummary,
      });
      feedbackSummaryForPayload = summarizeFeedbackText(feedbackText || "Feedback generated.");
      feedbackBulletsForPayload = deriveBulletsFromFeedbackText(feedbackText || "Feedback generated.", gradingCfg.maxFeedbackBullets);
    }
    const feedbackBullets = deriveBulletsFromFeedbackText(feedbackText || "Feedback generated.", gradingCfg.maxFeedbackBullets);

    const responsePayload =
      resultJson?.response && typeof resultJson.response === "object"
        ? {
            ...resultJson.response,
            criterionChecks: effectiveCriterionChecks,
            overallGradeWord: finalOverallGrade,
            overallGrade: finalOverallGrade,
            rawOverallGradeWord: gradePolicy.rawGrade,
            feedbackSummary: feedbackSummaryForPayload || resultJson?.response?.feedbackSummary || null,
            feedbackBullets: feedbackBulletsForPayload.length
              ? feedbackBulletsForPayload
              : resultJson?.response?.feedbackBullets || [],
            gradePolicy: {
              rawGrade: gradePolicy.rawGrade,
              finalGrade: gradePolicy.finalGrade,
              wasCapped: gradePolicy.wasCapped,
              capReason: gradePolicy.capReason,
            },
          }
        : null;
    const structuredPayload =
      resultJson?.structuredGradingV2 && typeof resultJson.structuredGradingV2 === "object"
        ? {
            ...resultJson.structuredGradingV2,
            criterionChecks: effectiveCriterionChecks,
            overallGradeWord: finalOverallGrade,
            overallGrade: finalOverallGrade,
          }
        : null;
    const existingSystemNotes = Array.isArray(resultJson?.systemNotes) ? resultJson.systemNotes : [];
    const withoutOldOverrideNotes = existingSystemNotes.filter(
      (n: unknown) => !String(n || "").startsWith("Assessor criterion overrides:")
    );
    const systemNotes = [
      ...withoutOldOverrideNotes,
      overrideRows.length
        ? `Assessor criterion overrides: ${overrideRows.length} criteria updated (${overrideSummary.reasonCodes.join(", ")}).`
        : null,
      shouldAutoRefreshFeedback ? "Feedback regenerated to match assessor criterion overrides." : null,
    ].filter(Boolean);

    const submissionPageCount = Math.max(
      0,
      Number(
        resultJson?.inputStrategy?.rawPdfPageCount ||
          resultJson?.referenceContextSnapshot?.submissionPageCount ||
          0
      )
    );
    const pageNotes = gradingCfg.pageNotesEnabled
      ? buildPageNotesFromCriterionChecks(effectiveCriterionChecks, {
          maxPages: gradingCfg.pageNotesMaxPages,
          maxLinesPerPage: gradingCfg.pageNotesMaxLinesPerPage,
          tone: gradingCfg.pageNotesTone,
          includeCriterionCode: gradingCfg.studentSafeMarkedPdf ? false : gradingCfg.pageNotesIncludeCriterionCode,
          totalPages: submissionPageCount,
          context: {
            unitCode: String(resultJson?.referenceContextSnapshot?.unit?.unitCode || ""),
            assignmentCode: String(resultJson?.referenceContextSnapshot?.assignmentBrief?.assignmentCode || ""),
            assignmentTitle: String(resultJson?.referenceContextSnapshot?.assignmentBrief?.title || ""),
            assignmentType: String(
              resultJson?.referenceContextSnapshot?.assignmentBrief?.assignmentType ||
                resultJson?.referenceContextSnapshot?.assignmentBrief?.type ||
                ""
            ),
            criteriaSet: criteriaWithBand.map((c: any) => String(c?.code || "").trim().toUpperCase()).filter(Boolean),
          },
        })
      : [];

    const marked = await createMarkedPdf(assessment.submission.storagePath, {
      submissionId: assessment.submission.id,
      overallGrade: String(finalOverallGrade || assessment.overallGrade || "REFER"),
      feedbackBullets: feedbackBullets.length ? feedbackBullets : ["Feedback generated."],
      feedbackText: feedbackText || "Feedback generated.",
      studentSafe: gradingCfg.studentSafeMarkedPdf,
      tone,
      strictness,
      studentName,
      assessorName: actor,
      markedDate,
      overallPlacement: "last",
      pageNotes,
    });

    const updated = await prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        overallGrade: finalOverallGrade,
        feedbackText: feedbackText || "Feedback generated.",
        annotatedPdfPath: marked.storagePath,
        resultJson: {
          ...resultJson,
          gradedBy: actor,
          response: responsePayload || resultJson?.response || null,
          structuredGradingV2: structuredPayload || resultJson?.structuredGradingV2 || null,
          assessorCriterionOverrides: overrideRows,
          assessorOverrideSummary: overrideSummary,
          systemNotes,
          gradePolicy: {
            criteriaBandCap: bandCap,
            rawOverallGrade: gradePolicy.rawGrade,
            finalOverallGrade: gradePolicy.finalGrade,
            resubmissionRequired,
            wasCapped: gradePolicy.wasCapped,
            capReason: gradePolicy.capReason,
          },
          pageNotesGenerated: pageNotes,
          pageNotesConfigUsed: {
            enabled: gradingCfg.pageNotesEnabled,
            tone: gradingCfg.pageNotesTone,
            maxPages: gradingCfg.pageNotesMaxPages,
            maxLinesPerPage: gradingCfg.pageNotesMaxLinesPerPage,
            includeCriterionCode: gradingCfg.studentSafeMarkedPdf ? false : gradingCfg.pageNotesIncludeCriterionCode,
            totalPages: submissionPageCount,
          },
          feedbackOverride: {
            edited: true,
            editedAt: new Date().toISOString(),
            studentName,
            assessorName: actor,
            markedDate,
            bulletCount: feedbackBullets.length,
            criterionOverrideCount: overrideRows.length,
          },
        } as any,
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        overallGrade: true,
        feedbackText: true,
        annotatedPdfPath: true,
        resultJson: true,
      },
    });

    return NextResponse.json({ ok: true, assessment: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update assessment feedback." }, { status: 500 });
  }
}
