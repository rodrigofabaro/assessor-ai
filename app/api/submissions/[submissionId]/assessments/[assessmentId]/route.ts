import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMarkedPdf } from "@/lib/grading/markedPdf";
import { deriveBulletsFromFeedbackText } from "@/lib/grading/feedbackDocument";
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
    const feedbackText = incomingFeedback || sanitizeStudentFeedbackText(assessment.feedbackText) || "";
    const hasOverrideRequest = Array.isArray(body.criterionOverrides) && body.criterionOverrides.length > 0;
    if (!feedbackText && !hasOverrideRequest) {
      return NextResponse.json({ error: "feedbackText or criterionOverrides is required." }, { status: 400 });
    }
    const markedDate = toUkDate(body.markedDate || resultJson?.feedbackOverride?.markedDate || null);
    const studentName = String(body.studentName || resultJson?.feedbackOverride?.studentName || resultJson.studentFirstNameUsed || "Student");
    const feedbackBullets = deriveBulletsFromFeedbackText(feedbackText || "Feedback generated.", gradingCfg.maxFeedbackBullets);
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

    const rawGradeFromResult =
      resultJson?.gradePolicy?.rawOverallGrade ||
      resultJson?.response?.rawOverallGradeWord ||
      resultJson?.response?.overallGradeWord ||
      assessment.overallGrade ||
      "REFER";
    const bandCap = criteriaWithBand.length
      ? applyBandCompletionCap(rawGradeFromResult, effectiveCriterionChecks as any, criteriaWithBand as any)
      : {
          rawGrade: normalizeGradeBand(rawGradeFromResult),
          finalGrade: normalizeGradeBand(rawGradeFromResult),
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
    const overrideRows = Array.from(overrideMap.values()).sort((a, b) => a.code.localeCompare(b.code));
    const overrideSummary = {
      appliedCount: overrideRows.length,
      reasonCodes: Array.from(new Set(overrideRows.map((r) => r.reasonCode))).sort((a, b) => a.localeCompare(b)),
      changedCodes: overrideRows.map((r) => r.code),
      lastUpdatedAt: overrideRows.length ? overrideRows[overrideRows.length - 1].updatedAt : null,
    };

    const responsePayload =
      resultJson?.response && typeof resultJson.response === "object"
        ? {
            ...resultJson.response,
            criterionChecks: effectiveCriterionChecks,
            overallGradeWord: finalOverallGrade,
            overallGrade: finalOverallGrade,
            rawOverallGradeWord: gradePolicy.rawGrade,
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
