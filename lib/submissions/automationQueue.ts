import { prisma } from "@/lib/prisma";
import { appendOpsEvent } from "@/lib/ops/eventLog";

export type SubmissionAutomationJobKind = "EXTRACT" | "GRADE";
export type SubmissionAutomationJobState = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";

type EnqueueOptions = {
  submissionId: string;
  type: SubmissionAutomationJobKind;
  createdBy?: string | null;
  payload?: Record<string, unknown> | null;
  priority?: number;
  maxAttempts?: number;
};

function retryDelayMs(attempts: number) {
  const attempt = Math.max(1, Number(attempts || 1));
  return Math.min(15 * 60 * 1000, attempt * attempt * 30 * 1000);
}

function normalizePayload(payload: EnqueueOptions["payload"]) {
  return payload && typeof payload === "object" ? payload : null;
}

export async function enqueueSubmissionAutomationJob(options: EnqueueOptions) {
  const submissionId = String(options.submissionId || "").trim();
  const type = String(options.type || "").trim().toUpperCase() as SubmissionAutomationJobKind;
  if (!submissionId) throw new Error("Missing submission id.");
  if (type !== "EXTRACT" && type !== "GRADE") throw new Error("Invalid automation job type.");

  const existing = await prisma.submissionAutomationJob.findFirst({
    where: {
      submissionId,
      type,
      status: { in: ["QUEUED", "RUNNING"] },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  if (existing) {
    return { job: existing, deduped: true as const };
  }

  const job = await prisma.submissionAutomationJob.create({
    data: {
      submissionId,
      type,
      status: "QUEUED",
      priority: Number.isFinite(Number(options.priority)) ? Math.max(1, Math.floor(Number(options.priority))) : 100,
      maxAttempts: Number.isFinite(Number(options.maxAttempts))
        ? Math.max(1, Math.floor(Number(options.maxAttempts)))
        : type === "EXTRACT"
          ? 3
          : 2,
      createdBy: String(options.createdBy || "").trim() || null,
      payload: normalizePayload(options.payload) as any,
    },
  });

  appendOpsEvent({
    type: "SUBMISSION_AUTOMATION_JOB_ENQUEUED",
    route: "/api/submissions/automation-jobs/run",
    status: 202,
    details: {
      jobId: job.id,
      submissionId,
      jobType: type,
      deduped: false,
    },
  });

  return { job, deduped: false as const };
}

export async function triggerSubmissionAutomationRunner(requestUrl: string, limit = 1) {
  try {
    const url = new URL("/api/submissions/automation-jobs/run", requestUrl);
    url.searchParams.set("limit", String(Math.max(1, Math.min(4, Math.floor(limit || 1)))));
    const res = await fetch(url.toString(), { method: "POST", cache: "no-store" });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function claimNextSubmissionAutomationJob() {
  while (true) {
    const now = new Date();
    const candidate = await prisma.submissionAutomationJob.findFirst({
      where: {
        status: "QUEUED",
        runAfterAt: { lte: now },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    if (!candidate) return null;

    const claim = await prisma.submissionAutomationJob.updateMany({
      where: { id: candidate.id, status: "QUEUED" },
      data: {
        status: "RUNNING",
        claimedAt: now,
        startedAt: candidate.startedAt || now,
        attempts: { increment: 1 },
      },
    });
    if (claim.count === 1) {
      return prisma.submissionAutomationJob.findUnique({ where: { id: candidate.id } });
    }
  }
}

async function callSubmissionJobRoute(job: { submissionId: string; type: SubmissionAutomationJobKind }, requestUrl: string) {
  const route =
    job.type === "EXTRACT"
      ? `/api/submissions/${encodeURIComponent(job.submissionId)}/extract`
      : `/api/submissions/${encodeURIComponent(job.submissionId)}/grade`;
  const url = new URL(route, requestUrl);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    ok: res.ok,
    status: res.status,
    json,
    text,
  };
}

function summarizeJobResult(jobType: SubmissionAutomationJobKind, response: { ok: boolean; status: number; json: any; text: string }) {
  if (response.ok) {
    return {
      outcome: response?.json?.skipped ? "skipped" : "completed",
      details: response.json || null,
    };
  }
  const error =
    String(response?.json?.error || response?.json?.message || response.text || `${jobType} request failed`).trim() ||
    `${jobType} request failed`;
  return {
    outcome: "failed",
    details: response.json || { error },
    error,
  };
}

async function finalizeSucceededJob(jobId: string, resultJson: Record<string, unknown> | null) {
  await prisma.submissionAutomationJob.update({
    where: { id: jobId },
    data: {
      status: "SUCCEEDED",
      finishedAt: new Date(),
      claimedAt: null,
      lastError: null,
      resultJson: (resultJson || null) as any,
    },
  });
}

async function finalizeFailedJob(job: {
  id: string;
  submissionId: string;
  type: SubmissionAutomationJobKind;
  attempts: number;
  maxAttempts: number;
}, message: string, resultJson: Record<string, unknown> | null) {
  const shouldRetry = Number(job.attempts || 0) < Number(job.maxAttempts || 1);
  const nextRunAt = shouldRetry ? new Date(Date.now() + retryDelayMs(job.attempts || 1)) : null;
  await prisma.submissionAutomationJob.update({
    where: { id: job.id },
    data: shouldRetry
      ? {
          status: "QUEUED",
          runAfterAt: nextRunAt || new Date(),
          claimedAt: null,
          finishedAt: null,
          lastError: message,
          resultJson: (resultJson || null) as any,
        }
      : {
          status: "FAILED",
          finishedAt: new Date(),
          claimedAt: null,
          lastError: message,
          resultJson: (resultJson || null) as any,
        },
  });

  appendOpsEvent({
    type: shouldRetry ? "SUBMISSION_AUTOMATION_JOB_REQUEUED" : "SUBMISSION_AUTOMATION_JOB_FAILED",
    route: "/api/submissions/automation-jobs/run",
    status: shouldRetry ? 202 : 500,
    details: {
      jobId: job.id,
      submissionId: job.submissionId,
      jobType: job.type,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      nextRunAt: nextRunAt?.toISOString() || null,
      error: message,
    },
  });
}

export async function runDueSubmissionAutomationJobs(requestUrl: string, limit = 1) {
  const processed: Array<Record<string, unknown>> = [];
  const runLimit = Math.max(1, Math.min(4, Math.floor(limit || 1)));

  for (let i = 0; i < runLimit; i += 1) {
    const job = await claimNextSubmissionAutomationJob();
    if (!job) break;

    const typedJob = {
      id: job.id,
      submissionId: job.submissionId,
      type: String(job.type || "").toUpperCase() as SubmissionAutomationJobKind,
      attempts: Number(job.attempts || 0),
      maxAttempts: Number(job.maxAttempts || 1),
    };

    appendOpsEvent({
      type: "SUBMISSION_AUTOMATION_JOB_STARTED",
      route: "/api/submissions/automation-jobs/run",
      status: 200,
      details: {
        jobId: typedJob.id,
        submissionId: typedJob.submissionId,
        jobType: typedJob.type,
        attempts: typedJob.attempts,
      },
    });

    try {
      const response = await callSubmissionJobRoute(typedJob, requestUrl);
      const summary = summarizeJobResult(typedJob.type, response);
      if (response.ok) {
        await finalizeSucceededJob(typedJob.id, {
          status: response.status,
          outcome: summary.outcome,
          response: summary.details,
        });
        appendOpsEvent({
          type: "SUBMISSION_AUTOMATION_JOB_SUCCEEDED",
          route: "/api/submissions/automation-jobs/run",
          status: response.status,
          details: {
            jobId: typedJob.id,
            submissionId: typedJob.submissionId,
            jobType: typedJob.type,
            outcome: summary.outcome,
          },
        });
        processed.push({
          jobId: typedJob.id,
          submissionId: typedJob.submissionId,
          type: typedJob.type,
          status: "SUCCEEDED",
          outcome: summary.outcome,
        });
        continue;
      }

      const message = String(summary.error || `${typedJob.type} request failed`).trim();
      await finalizeFailedJob(typedJob, message, {
        status: response.status,
        response: summary.details,
      });
      processed.push({
        jobId: typedJob.id,
        submissionId: typedJob.submissionId,
        type: typedJob.type,
        status: "FAILED",
        error: message,
      });
    } catch (error) {
      const message = String((error as { message?: unknown } | null)?.message || error || "Automation job failed").trim();
      await finalizeFailedJob(typedJob, message, { error: message });
      processed.push({
        jobId: typedJob.id,
        submissionId: typedJob.submissionId,
        type: typedJob.type,
        status: "FAILED",
        error: message,
      });
    }
  }

  return processed;
}
