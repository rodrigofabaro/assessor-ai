import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, makeRequestId } from "@/lib/api/errors";
import { evaluateExtractionReadiness } from "@/lib/grading/extractionQualityGate";
import { appendOpsEvent } from "@/lib/ops/eventLog";
import { isAdminMutationAllowed } from "@/lib/admin/permissions";

type BatchGradeBody = {
  submissionIds?: string[];
  assignmentBriefId?: string;
  unitCode?: string;
  assignmentRef?: string;
  retryFailedOnly?: boolean;
  forceRetry?: boolean;
  tone?: "supportive" | "professional" | "strict";
  strictness?: "lenient" | "balanced" | "strict";
  useRubricIfAvailable?: boolean;
  concurrency?: number;
  operationReason?: string;
};

type BatchResult = {
  submissionId: string;
  ok: boolean;
  status: number;
  grade?: string | null;
  assessmentId?: string | null;
  error?: string;
};

function parseJsonSafe(text: string) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

async function runWithConcurrency<T>(jobs: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= jobs.length) return;
      out[i] = await jobs[i]();
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(4, concurrency)) }, () => worker());
  await Promise.all(workers);
  return out;
}

export async function POST(req: Request) {
  const requestId = makeRequestId();
  try {
    const perm = await isAdminMutationAllowed();
    if (!perm.ok) {
      return apiError({
        status: 403,
        code: "ADMIN_PERMISSION_REQUIRED",
        userMessage: perm.reason || "Admin permission required.",
        route: "/api/submissions/batch-grade",
        requestId,
      });
    }
    const body = (await req.json().catch(() => ({}))) as BatchGradeBody;
    const explicitIds = Array.isArray(body.submissionIds)
      ? body.submissionIds.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    const assignmentBriefId = String(body.assignmentBriefId || "").trim();
    const unitCode = String(body.unitCode || "").trim();
    const assignmentRef = String(body.assignmentRef || "").trim().toUpperCase();

    let ids = explicitIds;
    if (!ids.length && (assignmentBriefId || (unitCode && assignmentRef))) {
      const assignments = await prisma.assignment.findMany({
        where: assignmentBriefId
          ? { assignmentBriefId }
          : {
              unitCode,
              assignmentRef,
            },
        select: { id: true },
      });
      const assignmentIds = assignments.map((a) => a.id);
      if (assignmentIds.length) {
        const rows = await prisma.submission.findMany({
          where: { assignmentId: { in: assignmentIds } },
          select: { id: true },
        });
        ids = rows.map((r) => r.id);
      }
    }

    if (!ids.length) {
      return apiError({
        status: 400,
        code: "BATCH_GRADE_IDS_REQUIRED",
        userMessage: "No submissions selected for batch grading. Provide submissionIds or a brief mapping target.",
        route: "/api/submissions/batch-grade",
        requestId,
      });
    }

    const uniqueIds = Array.from(new Set(ids));
    const submissions = await prisma.submission.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        status: true,
        extractedText: true,
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
    const statusById = new Map(submissions.map((s) => [s.id, String(s.status || "").toUpperCase()]));
    const extractionGateById = new Map(
      submissions.map((s) => [
        s.id,
        evaluateExtractionReadiness({
          submissionStatus: s.status,
          extractedText: s.extractedText,
          latestRun: s.extractionRuns?.[0] || null,
        }),
      ])
    );

    const retryFailedOnly = !!body.retryFailedOnly;
    const forceRetry = !!body.forceRetry;
    const operationReason = String(body.operationReason || "").trim();

    const targets = uniqueIds.filter((id) => {
      const status = statusById.get(id) || "";
      if (!status) return false;
      if (retryFailedOnly) return status === "FAILED";
      if (!forceRetry && status === "DONE") return false;
      const gate = extractionGateById.get(id);
      if (!gate?.ok) return false;
      return true;
    });

    const targetSet = new Set(targets);
    const skipped = uniqueIds
      .filter((id) => !targetSet.has(id))
      .map((id) => {
        const status = statusById.get(id) || "";
        const gate = extractionGateById.get(id);
        if (!status) return { submissionId: id, reason: "missing" };
        if (retryFailedOnly && status !== "FAILED") return { submissionId: id, reason: "not-failed" };
        if (!forceRetry && status === "DONE") return { submissionId: id, reason: "already-done" };
        if (gate && !gate.ok) {
          return {
            submissionId: id,
            reason: "extraction-not-ready",
            blockers: gate.blockers,
          };
        }
        return { submissionId: id, reason: "not-targeted" };
      });

    const concurrency = Number(body.concurrency || 1);
    const jobs = targets.map(
      (submissionId) => async (): Promise<BatchResult> => {
        const gradeUrl = new URL(`/api/submissions/${submissionId}/grade`, req.url);
        const res = await fetch(gradeUrl.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tone: body.tone,
            strictness: body.strictness,
            useRubricIfAvailable: body.useRubricIfAvailable,
          }),
          cache: "no-store",
        });
        const text = await res.text().catch(() => "");
        const json = parseJsonSafe(text) as any;

        if (!res.ok) {
          return {
            submissionId,
            ok: false,
            status: res.status,
            error: String(json?.error || `Grade failed (${res.status})`),
          };
        }

        return {
          submissionId,
          ok: true,
          status: 200,
          grade: json?.assessment?.overallGrade ?? null,
          assessmentId: json?.assessment?.id ?? null,
        };
      }
    );

    const results = await runWithConcurrency(jobs, concurrency);
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    appendOpsEvent({
      type: "BATCH_GRADE_RUN",
      route: "/api/submissions/batch-grade",
      status: 200,
      details: {
        requestId,
        requested: uniqueIds.length,
        targeted: targets.length,
        skipped: skipped.length,
        succeeded: okCount,
        failed: failCount,
        retryFailedOnly,
        forceRetry,
        assignmentBriefId: assignmentBriefId || null,
        unitCode: unitCode || null,
        assignmentRef: assignmentRef || null,
        reason: operationReason || null,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        requestId,
        summary: {
          requested: uniqueIds.length,
          targeted: targets.length,
          skipped: skipped.length,
          succeeded: okCount,
          failed: failCount,
        },
        skipped,
        results,
      },
      { headers: { "x-request-id": requestId } }
    );
  } catch (e: any) {
    return apiError({
      status: 500,
      code: "BATCH_GRADE_FAILED",
      userMessage: "Batch grading failed.",
      route: "/api/submissions/batch-grade",
      requestId,
      cause: e,
    });
  }
}
