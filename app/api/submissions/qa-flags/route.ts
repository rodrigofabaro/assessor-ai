import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function computeQaFlags(latestJson: Record<string, unknown>) {
  const confidenceSignals = (latestJson?.confidenceSignals || {}) as Record<string, unknown>;
  const evidenceDensitySummary = (latestJson?.evidenceDensitySummary || {}) as Record<string, unknown>;
  const rerunIntegrity = (latestJson?.rerunIntegrity || {}) as Record<string, unknown>;
  const submissionCompliance =
    ((latestJson?.submissionCompliance as Record<string, unknown> | null) ||
      ((latestJson?.response as Record<string, unknown> | null)?.submissionCompliance as Record<string, unknown> | null)) ||
    null;
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
  if (criteriaWithoutEvidence > 0) reasons.push(`${criteriaWithoutEvidence} criteria without evidence`);
  if (Number.isFinite(totalCitations) && totalCitations > 0 && totalCitations <= 2) {
    reasons.push("Very sparse evidence citations");
  }
  if (rerunDriftDetected) reasons.push("Reference context drift on re-run");
  if (decisionChangedCount > 0) {
    reasons.push(
      `Criterion decision drift on re-run (${decisionChangedCount} change${decisionChangedCount === 1 ? "" : "s"}; stricter ${decisionStricterCount}, lenient ${decisionLenientCount})`
    );
  }
  if (assessorOverrides.length > 0) reasons.push(`Assessor overrides applied (${assessorOverrides.length} criteria)`);
  if (String(submissionCompliance?.status || "").trim().toUpperCase() === "RETURN_REQUIRED") {
    reasons.push("Submission compliance return required");
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
      complianceStatus: String(submissionCompliance?.status || "").trim().toUpperCase() || null,
    },
    overrideSummary: {
      count: assessorOverrides.length,
      reasonCodes: overrideReasonCodes,
      criteriaCodes: overrideCriteriaCodes,
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const submissionIds: string[] = Array.isArray(body?.submissionIds)
      ? (Array.from(
          new Set(
            (body.submissionIds as unknown[])
              .map((v) => String(v || "").trim())
              .filter((v): v is string => Boolean(v))
          )
        ).slice(0, 200) as string[])
      : [];

    if (!submissionIds.length) {
      return NextResponse.json({ byId: {} });
    }

    const rows = await prisma.submission.findMany({
      where: { id: { in: submissionIds } },
      select: {
        id: true,
        assessments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            resultJson: true,
          },
        },
      },
    });

    const byId: Record<string, { qaFlags: ReturnType<typeof computeQaFlags>; assessmentActor: string | null }> = {};
    for (const row of rows as any[]) {
      const latestJson = (((row?.assessments?.[0]?.resultJson as any) || {}) as Record<string, unknown>) || {};
      byId[String(row.id)] = {
        qaFlags: computeQaFlags(latestJson),
        assessmentActor: String((latestJson as any)?.gradedBy || "").trim() || null,
      };
    }

    // Fill missing ids with a non-review qa payload so the client can stop retrying.
    for (const id of submissionIds) {
      if (!byId[id]) {
        byId[id] = {
          qaFlags: computeQaFlags({}),
          assessmentActor: null,
        };
      }
    }

    return NextResponse.json({ byId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to compute QA flags." }, { status: 500 });
  }
}
