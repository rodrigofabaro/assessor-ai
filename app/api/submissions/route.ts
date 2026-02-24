import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveAutomationState } from "@/lib/submissions/automation";
import { computeExtractionQuality } from "@/lib/submissions/extractionQuality";
import { sanitizeStudentFeedbackText } from "@/lib/grading/studentFeedback";
import { readTurnitinSubmissionStateMap } from "@/lib/turnitin/state";

type SubmissionsView = "workspace" | "qa";
type TimeframeParam = "today" | "week" | "all";
type SortByParam = "uploadedAt" | "status" | "student" | "grade";
type SortDirParam = "asc" | "desc";
type LaneFilterParam = "AUTO_READY" | "NEEDS_HUMAN" | "BLOCKED" | "COMPLETED" | "QA_REVIEW" | "ALL";

function parseBool(raw: string | null, fallback: boolean) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function parseTimeframe(raw: string | null): TimeframeParam {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "today") return "today";
  if (v === "week") return "week";
  return "all";
}

function parseSortBy(raw: string | null): SortByParam {
  const v = String(raw || "").trim();
  if (v === "status") return "status";
  if (v === "student") return "student";
  if (v === "grade") return "grade";
  return "uploadedAt";
}

function parseSortDir(raw: string | null): SortDirParam {
  return String(raw || "").trim().toLowerCase() === "asc" ? "asc" : "desc";
}

function parseLaneFilter(raw: string | null): LaneFilterParam {
  const v = String(raw || "").trim().toUpperCase();
  if (v === "AUTO_READY" || v === "NEEDS_HUMAN" || v === "BLOCKED" || v === "COMPLETED" || v === "QA_REVIEW") {
    return v as LaneFilterParam;
  }
  return "ALL";
}

function timeframeBounds(timeframe: TimeframeParam): { gte: Date; lt: Date } | null {
  if (timeframe === "all") return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  if (timeframe === "today") return { gte: startOfToday, lt: endOfToday };
  const day = startOfToday.getDay(); // 0=Sun
  const offsetToMonday = (day + 6) % 7;
  const startOfWeek = new Date(startOfToday.getTime() - offsetToMonday * 24 * 60 * 60 * 1000);
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { gte: startOfWeek, lt: endOfWeek };
}

function buildOrderBy(sortBy: SortByParam, sortDir: SortDirParam) {
  if (sortBy === "status") {
    return [{ status: sortDir }, { uploadedAt: "desc" as const }, { id: "desc" as const }];
  }
  if (sortBy === "student") {
    return [{ student: { fullName: sortDir } }, { uploadedAt: "desc" as const }, { id: "desc" as const }];
  }
  return [{ uploadedAt: sortDir }, { id: sortDir }];
}

function gradeRank(raw: string) {
  const up = String(raw || "").trim().toUpperCase();
  if (up === "DISTINCTION") return 5;
  if (up === "MERIT") return 4;
  if (up === "PASS") return 3;
  if (up === "PASS_ON_RESUBMISSION") return 2;
  if (up === "REFER") return 1;
  return 0;
}

function isReadyToUploadLike(row: { grade?: string | null; overallGrade?: string | null; feedback?: string | null; markedPdfPath?: string | null }) {
  const grade = String(row.grade ?? row.overallGrade ?? "").trim();
  const hasMarkedPdf = Boolean(String(row.markedPdfPath || "").trim());
  return Boolean(grade && hasMarkedPdf);
}

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

function mapWorkspaceSubmission(
  s: any,
  opts: {
    includeWorkspaceQa: boolean;
    includeWorkspaceFeedback: boolean;
    turnitinStateBySubmissionId?: Record<string, any> | null;
  }
) {
  const latest = s.assessments?.[0] || null;
  const feedbackText = opts.includeWorkspaceFeedback ? sanitizeStudentFeedbackText(latest?.feedbackText || null) || null : null;
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
    assignmentBriefId: s.assignment?.assignmentBriefId ?? null,
    extractedText: null,
    _count: s._count,
    grade: latest?.overallGrade || null,
    overallGrade: latest?.overallGrade || null,
    feedback: feedbackText,
    markedPdfPath: latest?.annotatedPdfPath || null,
    extractionQuality,
  });

  const latestJson = opts.includeWorkspaceQa ? (((latest?.resultJson as any) || {}) as Record<string, unknown>) : {};
  const qaFlags = opts.includeWorkspaceQa ? computeQaFlags(latestJson) : null;

  return {
    id: s.id,
    filename: s.filename,
    uploadedAt: s.uploadedAt,
    status: s.status,
    studentId: s.studentId,
    assignmentId: s.assignmentId,
    assignmentBriefId: s.assignment?.assignmentBriefId ?? null,
    student: s.student ?? null,
    assignment: s.assignment ?? null,
    _count: s._count,
    grade: latest?.overallGrade || null,
    overallGrade: latest?.overallGrade || null,
    feedback: feedbackText,
    markedPdfPath: latest?.annotatedPdfPath || null,
    gradedAt: latest?.createdAt || null,
    assessmentActor: opts.includeWorkspaceQa ? String((latestJson as any)?.gradedBy || "").trim() || null : null,
    extractionMode: String((latestRun?.sourceMeta as any)?.extractionMode || "").toUpperCase() || null,
    coverReady: Boolean((latestRun?.sourceMeta as any)?.coverReady),
    automationState: automation.state,
    automationReason: automation.reason,
    automationExceptionCode: automation.exceptionCode,
    automationRecommendedAction: automation.recommendedAction,
    extractionQuality,
    qaFlags,
    turnitin: opts.turnitinStateBySubmissionId?.[s.id] || null,
  };
}

function applyWorkspacePostFilters(
  rows: any[],
  opts: {
    readyOnly: boolean;
    handoffOnly: boolean;
    laneFilter: LaneFilterParam;
    qaReviewOnly: boolean;
    sortBy: SortByParam;
    sortDir: SortDirParam;
  }
) {
  let filteredSubmissions = rows;
  if (opts.readyOnly || opts.handoffOnly) {
    filteredSubmissions = filteredSubmissions.filter((row) => isReadyToUploadLike(row));
  }
  if (opts.laneFilter === "QA_REVIEW") {
    filteredSubmissions = filteredSubmissions.filter((row) => Boolean(row.qaFlags?.shouldReview));
  } else if (opts.laneFilter !== "ALL") {
    filteredSubmissions = filteredSubmissions.filter((row) => String(row.automationState || "") === opts.laneFilter);
  }
  if (opts.qaReviewOnly) {
    filteredSubmissions = filteredSubmissions.filter((row) => Boolean(row.qaFlags?.shouldReview));
  }
  if (opts.sortBy === "grade") {
    const dir = opts.sortDir === "asc" ? 1 : -1;
    filteredSubmissions = [...filteredSubmissions].sort((a: any, b: any) => {
      const av = gradeRank(String(a.grade || a.overallGrade || ""));
      const bv = gradeRank(String(b.grade || b.overallGrade || ""));
      if (av !== bv) return (av - bv) * dir;
      const at = new Date(a.uploadedAt || 0).getTime() || 0;
      const bt = new Date(b.uploadedAt || 0).getTime() || 0;
      return (at - bt) * -1;
    });
  }
  return filteredSubmissions;
}

function buildWorkspaceWhere(opts: {
  q: string;
  statusFilter: string;
  unlinkedOnly: boolean;
  timeframe: TimeframeParam;
}) {
  const and: any[] = [];
  if (opts.statusFilter) and.push({ status: opts.statusFilter as any });
  if (opts.unlinkedOnly) and.push({ studentId: null });
  const bounds = timeframeBounds(opts.timeframe);
  if (bounds) and.push({ uploadedAt: bounds });
  if (opts.q) {
    and.push({
      OR: [
        { filename: { contains: opts.q, mode: "insensitive" } },
        { student: { is: { fullName: { contains: opts.q, mode: "insensitive" } } } },
        { student: { is: { email: { contains: opts.q, mode: "insensitive" } } } },
        { student: { is: { externalRef: { contains: opts.q, mode: "insensitive" } } } },
        { assignment: { is: { title: { contains: opts.q, mode: "insensitive" } } } },
        { assignment: { is: { unitCode: { contains: opts.q, mode: "insensitive" } } } },
        { assignment: { is: { assignmentRef: { contains: opts.q, mode: "insensitive" } } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

function buildQaWhere(opts: {
  q: string;
  statusFilter: string;
  timeframe: TimeframeParam;
  course: string;
  unitCode: string;
  assignmentRef: string;
  grade: string;
}) {
  const and: any[] = [];
  if (opts.statusFilter) and.push({ status: opts.statusFilter as any });
  const bounds = timeframeBounds(opts.timeframe);
  if (bounds) and.push({ uploadedAt: bounds });
  if (opts.course) and.push({ student: { is: { courseName: opts.course } } });
  if (opts.unitCode) and.push({ assignment: { is: { unitCode: opts.unitCode } } });
  if (opts.assignmentRef) and.push({ assignment: { is: { assignmentRef: opts.assignmentRef } } });

  const grade = String(opts.grade || "").trim().toUpperCase();
  if (grade && grade !== "ALL") {
    if (grade === "UNGRADED") {
      and.push({ NOT: { assessments: { some: { overallGrade: { not: null } } } } });
    } else if (["REFER", "PASS", "PASS_ON_RESUBMISSION", "MERIT", "DISTINCTION"].includes(grade)) {
      and.push({ assessments: { some: { overallGrade: grade } } });
    }
  }

  if (opts.q) {
    and.push({
      OR: [
        { filename: { contains: opts.q, mode: "insensitive" } },
        { student: { is: { fullName: { contains: opts.q, mode: "insensitive" } } } },
        { student: { is: { email: { contains: opts.q, mode: "insensitive" } } } },
        { student: { is: { courseName: { contains: opts.q, mode: "insensitive" } } } },
        { assignment: { is: { unitCode: { contains: opts.q, mode: "insensitive" } } } },
        { assignment: { is: { assignmentRef: { contains: opts.q, mode: "insensitive" } } } },
        { assignment: { is: { title: { contains: opts.q, mode: "insensitive" } } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const view: SubmissionsView = String(searchParams.get("view") || "").trim().toLowerCase() === "qa" ? "qa" : "workspace";
  const includeQa = parseBool(searchParams.get("qa"), view === "qa");
  const includeFeedback = parseBool(searchParams.get("includeFeedback"), view === "workspace");
  const paginate = parseBool(searchParams.get("paginate"), false);
  const page = parsePositiveInt(searchParams.get("page"), 1, 1, 100000);
  const pageSizeDefault = view === "qa" ? 60 : 80;
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), pageSizeDefault, 10, 200);
  const q = String(searchParams.get("q") || "").trim();
  const statusFilter = String(searchParams.get("status") || "").trim();
  const laneFilter = parseLaneFilter(searchParams.get("lane"));
  const readyOnly = parseBool(searchParams.get("ready"), false);
  const handoffOnly = parseBool(searchParams.get("handoff"), false);
  const qaReviewOnly = parseBool(searchParams.get("qaOnly"), false);
  const timeframe = parseTimeframe(searchParams.get("timeframe"));
  const sortBy = parseSortBy(searchParams.get("sortBy"));
  const sortDir = parseSortDir(searchParams.get("sortDir"));
  const skip = paginate ? (page - 1) * pageSize : undefined;
  const take = paginate ? pageSize : undefined;
  const orderBy = buildOrderBy(sortBy, sortDir);

  if (view === "qa") {
    const where = buildQaWhere({
      q,
      statusFilter,
      timeframe,
      course: String(searchParams.get("course") || "").trim(),
      unitCode: String(searchParams.get("unitCode") || "").trim(),
      assignmentRef: String(searchParams.get("assignmentRef") || "").trim().toUpperCase(),
      grade: String(searchParams.get("grade") || "").trim(),
    });

    const [totalItems, rows] = await Promise.all([
      paginate ? prisma.submission.count({ where }) : Promise.resolve(0),
      prisma.submission.findMany({
        where,
        orderBy,
        ...(paginate ? { skip, take } : {}),
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
      }),
    ]);

    const turnitinStateBySubmissionId = readTurnitinSubmissionStateMap();
    const submissions = rows.map((s: any) => {
      const latest = s.assessments?.[0] || null;
      const latestJson = includeQa ? (((latest?.resultJson as any) || {}) as Record<string, unknown>) : {};
      const feedbackText = includeFeedback ? sanitizeStudentFeedbackText(latest?.feedbackText || null) || null : null;
      const qaFlags = includeQa ? computeQaFlags(latestJson) : null;
      const turnitin = turnitinStateBySubmissionId[s.id] || null;
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
        turnitin,
      };
    });

    if (!paginate) return NextResponse.json(submissions);
    const total = totalItems;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({
      items: submissions,
      pageInfo: {
        page,
        pageSize,
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  }

  const where = buildWorkspaceWhere({
    q,
    statusFilter,
    unlinkedOnly: parseBool(searchParams.get("unlinked"), false),
    timeframe,
  });

  const requiresWorkspacePostFilter =
    laneFilter !== "ALL" || readyOnly || handoffOnly || qaReviewOnly || sortBy === "grade";
  const includeWorkspaceQa = includeQa || laneFilter === "QA_REVIEW" || qaReviewOnly;
  const includeWorkspaceFeedback = includeFeedback || readyOnly || handoffOnly;

  if (paginate && requiresWorkspacePostFilter) {
    const slimRows = await prisma.submission.findMany({
      where,
      orderBy,
      select: {
        id: true,
        filename: true,
        uploadedAt: true,
        status: true,
        studentId: true,
        assignmentId: true,
        assignment: {
          select: {
            assignmentBriefId: true,
          },
        },
        assessments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            overallGrade: true,
            annotatedPdfPath: true,
            createdAt: true,
            ...(includeWorkspaceQa ? { resultJson: true } : {}),
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

    const slimSubmissions = slimRows.map((s: any) =>
      mapWorkspaceSubmission(s, {
        includeWorkspaceQa,
        includeWorkspaceFeedback: false,
        turnitinStateBySubmissionId: null,
      })
    );
    const filteredSubmissions = applyWorkspacePostFilters(slimSubmissions, {
      readyOnly,
      handoffOnly,
      laneFilter,
      qaReviewOnly,
      sortBy,
      sortDir,
    });

    const start = Math.max(0, (page - 1) * pageSize);
    const pageSlice = filteredSubmissions.slice(start, start + pageSize);
    const pageIds = pageSlice.map((row: any) => String(row.id));
    const pageMetaById = new Map<string, any>(pageSlice.map((row: any) => [String(row.id), row]));

    const detailRows = pageIds.length
      ? await prisma.submission.findMany({
          where: { id: { in: pageIds } },
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
                assignmentBriefId: true,
              },
            },
            assessments: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                overallGrade: true,
                annotatedPdfPath: true,
                createdAt: true,
                ...(includeWorkspaceFeedback ? { feedbackText: true } : {}),
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
        })
      : [];

    const turnitinStateBySubmissionId = readTurnitinSubmissionStateMap();
    const detailedById = new Map<string, any>(
      detailRows.map((s: any) => [
        String(s.id),
        mapWorkspaceSubmission(s, {
          includeWorkspaceQa: false,
          includeWorkspaceFeedback,
          turnitinStateBySubmissionId,
        }),
      ])
    );

    const pagedItems = pageIds
      .map((id) => {
        const detailed = detailedById.get(id);
        if (!detailed) return null;
        const meta = pageMetaById.get(id);
        return {
          ...detailed,
          qaFlags: meta?.qaFlags ?? detailed.qaFlags ?? null,
          assessmentActor: meta?.assessmentActor ?? detailed.assessmentActor ?? null,
        };
      })
      .filter(Boolean);

    const total = filteredSubmissions.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({
      items: pagedItems,
      pageInfo: {
        page,
        pageSize,
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  }

  const [countBeforeFilter, rows] = await Promise.all([
    paginate && !requiresWorkspacePostFilter ? prisma.submission.count({ where }) : Promise.resolve(0),
    prisma.submission.findMany({
      where,
      orderBy,
      ...(paginate && !requiresWorkspacePostFilter ? { skip, take } : {}),
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
            assignmentBriefId: true,
          },
        },
        assessments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            overallGrade: true,
            annotatedPdfPath: true,
            createdAt: true,
            ...(includeWorkspaceFeedback ? { feedbackText: true } : {}),
            ...(includeWorkspaceQa ? { resultJson: true } : {}),
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
    }),
  ]);
  const turnitinStateBySubmissionId = readTurnitinSubmissionStateMap();

  const submissions = rows.map((s: any) =>
    mapWorkspaceSubmission(s, {
      includeWorkspaceQa,
      includeWorkspaceFeedback,
      turnitinStateBySubmissionId,
    })
  );

  let filteredSubmissions = submissions;
  if (requiresWorkspacePostFilter) {
    filteredSubmissions = applyWorkspacePostFilters(filteredSubmissions, {
      readyOnly,
      handoffOnly,
      laneFilter,
      qaReviewOnly,
      sortBy,
      sortDir,
    });
  }

  if (!paginate) return NextResponse.json(filteredSubmissions);
  const pagedItems =
    requiresWorkspacePostFilter
      ? filteredSubmissions.slice(Math.max(0, (page - 1) * pageSize), Math.max(0, (page - 1) * pageSize) + pageSize)
      : filteredSubmissions;
  const total = requiresWorkspacePostFilter ? filteredSubmissions.length : countBeforeFilter;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return NextResponse.json({
    items: pagedItems,
    pageInfo: {
      page,
      pageSize,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
}
