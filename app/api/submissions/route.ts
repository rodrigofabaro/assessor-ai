import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveAutomationState } from "@/lib/submissions/automation";
import { computeExtractionQuality } from "@/lib/submissions/extractionQuality";
import { sanitizeStudentFeedbackText } from "@/lib/grading/studentFeedback";

type SubmissionsView = "workspace" | "qa";

function parseBool(raw: string | null, fallback: boolean) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function computeQaFlags(latestJson: Record<string, unknown>) {
  const confidenceSignals = (latestJson?.confidenceSignals || {}) as Record<string, unknown>;
  const evidenceDensitySummary = (latestJson?.evidenceDensitySummary || {}) as Record<string, unknown>;
  const rerunIntegrity = (latestJson?.rerunIntegrity || {}) as Record<string, unknown>;
  const decisionDiff = (rerunIntegrity?.decisionDiff || {}) as Record<string, unknown>;
  const assessorOverrides = Array.isArray((latestJson as any)?.assessorCriterionOverrides)
    ? (latestJson as any).assessorCriterionOverrides
    : [];
  const overrideReasonCodes = Array.from(
    new Set<string>(
      assessorOverrides
        .map((row: any) => String(row?.reasonCode || "").trim().toUpperCase())
        .filter((v: string): v is string => Boolean(v))
    )
  ).sort((a: string, b: string) => a.localeCompare(b));
  const overrideCriteriaCodes = Array.from(
    new Set<string>(
      assessorOverrides
        .map((row: any) => String(row?.code || "").trim().toUpperCase())
        .filter((v: string): v is string => /^[PMD]\d{1,2}$/.test(v))
    )
  ).sort((a: string, b: string) => a.localeCompare(b));
  const gradingConfidence = Number(confidenceSignals?.gradingConfidence);
  const extractionConfidence = Number(confidenceSignals?.extractionConfidence);
  const totalCitations = Number(evidenceDensitySummary?.totalCitations || 0);
  const criteriaWithoutEvidence = Number(evidenceDensitySummary?.criteriaWithoutEvidence || 0);
  const rerunDriftDetected = Boolean((rerunIntegrity as any)?.snapshotDiff?.changed);
  const decisionChangedCount = Number(decisionDiff?.changedCount || 0);
  const decisionStricterCount = Number(decisionDiff?.stricterCount || 0);
  const decisionLenientCount = Number(decisionDiff?.lenientCount || 0);
  const lowConfidenceThreshold = Math.max(0.2, Math.min(0.95, Number(process.env.QA_LOW_CONFIDENCE_THRESHOLD || 0.6)));
  const reasons: string[] = [];
  if (Number.isFinite(gradingConfidence) && gradingConfidence >= 0 && gradingConfidence < lowConfidenceThreshold) {
    reasons.push(`Low grading confidence (${gradingConfidence.toFixed(2)})`);
  }
  if (Number.isFinite(extractionConfidence) && extractionConfidence >= 0 && extractionConfidence < lowConfidenceThreshold) {
    reasons.push(`Low extraction confidence (${extractionConfidence.toFixed(2)})`);
  }
  if (criteriaWithoutEvidence > 0) {
    reasons.push(`${criteriaWithoutEvidence} criteria without evidence`);
  }
  if (Number.isFinite(totalCitations) && totalCitations > 0 && totalCitations <= 2) {
    reasons.push("Very sparse evidence citations");
  }
  if (rerunDriftDetected) {
    reasons.push("Reference context drift on re-run");
  }
  if (decisionChangedCount > 0) {
    reasons.push(
      `Criterion decision drift on re-run (${decisionChangedCount} change${decisionChangedCount === 1 ? "" : "s"}; stricter ${decisionStricterCount}, lenient ${decisionLenientCount})`
    );
  }
  if (assessorOverrides.length > 0) {
    reasons.push(`Assessor overrides applied (${assessorOverrides.length} criteria)`);
  }

  return {
    shouldReview: reasons.length > 0,
    reasons,
    metrics: {
      gradingConfidence: Number.isFinite(gradingConfidence) ? gradingConfidence : null,
      extractionConfidence: Number.isFinite(extractionConfidence) ? extractionConfidence : null,
      totalCitations: Number.isFinite(totalCitations) ? totalCitations : 0,
      criteriaWithoutEvidence: Number.isFinite(criteriaWithoutEvidence) ? criteriaWithoutEvidence : 0,
      rerunDriftDetected,
      decisionChangedCount: Number.isFinite(decisionChangedCount) ? decisionChangedCount : 0,
      decisionStricterCount: Number.isFinite(decisionStricterCount) ? decisionStricterCount : 0,
      decisionLenientCount: Number.isFinite(decisionLenientCount) ? decisionLenientCount : 0,
      assessorOverrideCount: assessorOverrides.length,
    },
    overrideSummary: {
      count: assessorOverrides.length,
      reasonCodes: overrideReasonCodes,
      criteriaCodes: overrideCriteriaCodes,
    },
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const view: SubmissionsView = String(searchParams.get("view") || "").trim().toLowerCase() === "qa" ? "qa" : "workspace";
  const includeQa = parseBool(searchParams.get("qa"), view === "qa");
  const includeFeedback = parseBool(searchParams.get("includeFeedback"), view === "workspace");

  if (view === "qa") {
    const rows = await prisma.submission.findMany({
      orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        filename: true,
        uploadedAt: true,
        status: true,
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            courseName: true,
          },
        },
        assignment: {
          select: {
            unitCode: true,
            assignmentRef: true,
            title: true,
          },
        },
        assessments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            overallGrade: true,
            createdAt: true,
            ...(includeFeedback ? { feedbackText: true } : {}),
            ...(includeQa ? { resultJson: true } : {}),
          },
        },
      },
    });

    const submissions = rows.map((s: any) => {
      const latest = s.assessments?.[0] || null;
      const latestJson = includeQa ? (((latest?.resultJson as any) || {}) as Record<string, unknown>) : {};
      const feedbackText = includeFeedback ? sanitizeStudentFeedbackText(latest?.feedbackText || null) || null : null;
      const qaFlags = includeQa ? computeQaFlags(latestJson) : null;
      return {
        id: s.id,
        filename: s.filename,
        uploadedAt: s.uploadedAt,
        status: s.status,
        student: s.student,
        assignment: s.assignment,
        grade: latest?.overallGrade || null,
        overallGrade: latest?.overallGrade || null,
        feedback: feedbackText,
        gradedAt: latest?.createdAt || null,
        assessmentActor: includeQa ? String((latestJson as any)?.gradedBy || "").trim() || null : null,
        qaFlags,
      };
    });

    return NextResponse.json(submissions);
  }

  const rows = await prisma.submission.findMany({
    orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      filename: true,
      uploadedAt: true,
      status: true,
      studentId: true,
      assignmentId: true,
      student: {
        select: {
          id: true,
          fullName: true,
          email: true,
          externalRef: true,
          courseName: true,
        },
      },
      assignment: {
        select: {
          id: true,
          title: true,
          unitCode: true,
          assignmentRef: true,
        },
      },
      assessments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          overallGrade: true,
          annotatedPdfPath: true,
          createdAt: true,
          ...(includeFeedback ? { feedbackText: true } : {}),
          ...(includeQa ? { resultJson: true } : {}),
        },
      },
      _count: {
        select: {
          extractionRuns: true,
          assessments: true,
        },
      },
      extractionRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          status: true,
          overallConfidence: true,
          pageCount: true,
          warnings: true,
          sourceMeta: true,
        },
      },
    },
  });

  const submissions = rows.map((s: any) => {
    const latest = s.assessments?.[0] || null;
    const feedbackText = includeFeedback ? sanitizeStudentFeedbackText(latest?.feedbackText || null) || null : null;
    const latestRun = s.extractionRuns?.[0] || null;
    const extractionQuality = computeExtractionQuality({
      submissionStatus: s.status,
      extractedText: null,
      latestRun: latestRun
        ? {
            status: latestRun.status,
            overallConfidence: latestRun.overallConfidence,
            pageCount: latestRun.pageCount,
            warnings: latestRun.warnings,
            sourceMeta: latestRun.sourceMeta,
          }
        : null,
    });

    const automation = deriveAutomationState({
      status: s.status,
      studentId: s.studentId,
      assignmentId: s.assignmentId,
      extractedText: null,
      _count: s._count,
      grade: latest?.overallGrade || null,
      overallGrade: latest?.overallGrade || null,
      feedback: feedbackText,
      markedPdfPath: latest?.annotatedPdfPath || null,
      extractionQuality,
    });
    const latestJson = includeQa ? (((latest?.resultJson as any) || {}) as Record<string, unknown>) : {};
    const qaFlags = includeQa ? computeQaFlags(latestJson) : null;

    return {
      id: s.id,
      filename: s.filename,
      uploadedAt: s.uploadedAt,
      status: s.status,
      studentId: s.studentId,
      assignmentId: s.assignmentId,
      student: s.student,
      assignment: s.assignment,
      _count: s._count,
      grade: latest?.overallGrade || null,
      overallGrade: latest?.overallGrade || null,
      feedback: feedbackText,
      markedPdfPath: latest?.annotatedPdfPath || null,
      gradedAt: latest?.createdAt || null,
      assessmentActor: includeQa ? String((latestJson as any)?.gradedBy || "").trim() || null : null,
      extractionMode: String((latestRun?.sourceMeta as any)?.extractionMode || "").toUpperCase() || null,
      coverReady: Boolean((latestRun?.sourceMeta as any)?.coverReady),
      automationState: automation.state,
      automationReason: automation.reason,
      automationExceptionCode: automation.exceptionCode,
      automationRecommendedAction: automation.recommendedAction,
      extractionQuality,
      qaFlags,
    };
  });

  return NextResponse.json(submissions);
}
