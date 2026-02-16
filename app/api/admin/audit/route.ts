import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type AuditEventDto = {
  id: string;
  ts: string;
  type: string;
  severity: "info" | "warn" | "error";
  title: string;
  summary: string;
  actor?: string | null;
  entityKind: "submission" | "reference" | "student" | "assignment" | "system";
  entityId?: string | null;
  entityLabel?: string | null;
  href?: string | null;
  meta?: any;
};

function includesQuery(value: string, query: string) {
  if (!query) return true;
  return value.toLowerCase().includes(query.toLowerCase());
}

function clampTake(input: string | null) {
  const n = Number(input || 100);
  if (!Number.isFinite(n)) return 100;
  return Math.max(20, Math.min(300, Math.floor(n)));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") || "").trim();
  const typeFilter = String(searchParams.get("type") || "ALL").trim().toUpperCase();
  const take = clampTake(searchParams.get("take"));

  const [linkEvents, extractionRuns, assessments, lockedReferences, failedSubmissions, failedReferences] =
    await Promise.all([
      prisma.submissionAuditEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 250,
        include: {
          submission: {
            select: {
              id: true,
              filename: true,
              student: { select: { id: true, fullName: true, email: true } },
              assignment: { select: { id: true, unitCode: true, assignmentRef: true, title: true } },
            },
          },
        },
      }),
      prisma.submissionExtractionRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 250,
        include: {
          submission: {
            select: {
              id: true,
              filename: true,
              student: { select: { id: true, fullName: true, email: true } },
              assignment: { select: { id: true, unitCode: true, assignmentRef: true, title: true } },
            },
          },
        },
      }),
      prisma.assessment.findMany({
        orderBy: { createdAt: "desc" },
        take: 250,
        include: {
          submission: {
            select: {
              id: true,
              filename: true,
              student: { select: { id: true, fullName: true, email: true } },
              assignment: { select: { id: true, unitCode: true, assignmentRef: true, title: true } },
            },
          },
        },
      }),
      prisma.referenceDocument.findMany({
        where: { lockedAt: { not: null } },
        orderBy: { lockedAt: "desc" },
        take: 120,
        select: {
          id: true,
          type: true,
          title: true,
          version: true,
          lockedAt: true,
          lockedBy: true,
        },
      }),
      prisma.submission.findMany({
        where: { status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 120,
        select: {
          id: true,
          filename: true,
          updatedAt: true,
          student: { select: { id: true, fullName: true, email: true } },
          assignment: { select: { id: true, unitCode: true, assignmentRef: true, title: true } },
        },
      }),
      prisma.referenceDocument.findMany({
        where: { status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 120,
        select: { id: true, type: true, title: true, updatedAt: true },
      }),
    ]);

  const events: AuditEventDto[] = [];

  for (const e of linkEvents) {
    const studentName = e.submission.student?.fullName || "Unknown student";
    const evtType = String(e.type || "").toUpperCase();
    const isLinked = evtType === "STUDENT_LINKED";
    const title = isLinked ? "Student linked to submission" : "Student unlinked from submission";
    const summary = `${studentName} · ${e.submission.filename}`;
    events.push({
      id: `link-${e.id}`,
      ts: e.createdAt.toISOString(),
      type: evtType || "SUBMISSION_LINK",
      severity: "info",
      title,
      summary,
      actor: e.actor || null,
      entityKind: "submission",
      entityId: e.submissionId,
      entityLabel: e.submission.filename,
      href: `/submissions/${e.submissionId}`,
      meta: e.meta,
    });
  }

  for (const run of extractionRuns) {
    const status = String(run.status || "").toUpperCase();
    const isFailed = status === "FAILED";
    const isNeedsOcr = status === "NEEDS_OCR";
    const severity: AuditEventDto["severity"] = isFailed ? "error" : isNeedsOcr ? "warn" : "info";
    const title =
      status === "DONE"
        ? "Extraction completed"
        : status === "NEEDS_OCR"
          ? "Extraction needs OCR"
          : status === "FAILED"
            ? "Extraction failed"
            : "Extraction updated";
    const summary = `${run.submission.filename} · ${status} · conf ${Math.round((run.overallConfidence || 0) * 100)}%`;
    events.push({
      id: `extract-${run.id}`,
      ts: (run.finishedAt || run.startedAt).toISOString(),
      type: `EXTRACTION_${status}`,
      severity,
      title,
      summary,
      entityKind: "submission",
      entityId: run.submissionId,
      entityLabel: run.submission.filename,
      href: `/submissions/${run.submissionId}`,
      meta: {
        status,
        isScanned: run.isScanned,
        warningCount: Array.isArray(run.warnings) ? run.warnings.length : 0,
      },
    });
  }

  for (const a of assessments) {
    const grade = String(a.overallGrade || "—");
    const result = (a.resultJson || {}) as Record<string, any>;
    const summary = `${a.submission.filename} · grade ${grade}`;
    events.push({
      id: `grade-${a.id}`,
      ts: a.createdAt.toISOString(),
      type: "GRADE_DONE",
      severity: "info",
      title: "Grading completed",
      summary,
      actor: "ai-grader",
      entityKind: "submission",
      entityId: a.submissionId,
      entityLabel: a.submission.filename,
      href: `/submissions/${a.submissionId}`,
      meta: {
        overallGrade: a.overallGrade,
        hasFeedback: !!String(a.feedbackText || "").trim(),
        hasMarkedPdf: !!String(a.annotatedPdfPath || "").trim(),
        requestId: result.requestId || null,
        gradingTimeline: result.gradingTimeline || null,
        tone: result.tone || null,
        strictness: result.strictness || null,
        model: result.model || null,
      },
    });
  }

  for (const doc of lockedReferences) {
    events.push({
      id: `ref-lock-${doc.id}-${doc.lockedAt?.toISOString() || "na"}`,
      ts: (doc.lockedAt || new Date()).toISOString(),
      type: "REFERENCE_LOCKED",
      severity: "info",
      title: "Reference locked",
      summary: `${doc.type} v${doc.version} · ${doc.title}`,
      actor: doc.lockedBy || null,
      entityKind: "reference",
      entityId: doc.id,
      entityLabel: doc.title,
      href: "/admin/reference",
    });
  }

  for (const s of failedSubmissions) {
    events.push({
      id: `sub-failed-${s.id}-${s.updatedAt.toISOString()}`,
      ts: s.updatedAt.toISOString(),
      type: "SUBMISSION_FAILED",
      severity: "error",
      title: "Submission workflow failed",
      summary: s.filename,
      entityKind: "submission",
      entityId: s.id,
      entityLabel: s.filename,
      href: `/submissions/${s.id}`,
    });
  }

  for (const r of failedReferences) {
    events.push({
      id: `ref-failed-${r.id}-${r.updatedAt.toISOString()}`,
      ts: r.updatedAt.toISOString(),
      type: "REFERENCE_FAILED",
      severity: "error",
      title: "Reference extraction failed",
      summary: `${r.type} · ${r.title}`,
      entityKind: "reference",
      entityId: r.id,
      entityLabel: r.title,
      href: "/admin/reference",
    });
  }

  const queryFiltered = events.filter((e) => {
    const typeOk = typeFilter === "ALL" ? true : e.type.toUpperCase() === typeFilter;
    if (!typeOk) return false;
    if (!q) return true;
    const hay = [
      e.type,
      e.title,
      e.summary,
      e.actor || "",
      e.entityLabel || "",
      e.entityId || "",
      JSON.stringify(e.meta || {}),
    ].join(" ");
    return includesQuery(hay, q);
  });

  queryFiltered.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const typeOptions = Array.from(new Set(events.map((e) => e.type))).sort();

  return NextResponse.json({
    events: queryFiltered.slice(0, take),
    total: queryFiltered.length,
    typeOptions,
    generatedAt: new Date().toISOString(),
  });
}
