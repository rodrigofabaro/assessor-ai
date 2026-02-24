"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buildCopySummary } from "@/lib/submissionReady";
import { isReadyToUpload } from "@/lib/submissionReady";
import { useSubmissionsList, type LaneKey } from "@/lib/submissions/useSubmissionsList";
import type { SubmissionRow } from "@/lib/submissions/types";
import { buildMarkedPdfUrl } from "@/lib/submissions/markedPdfUrl";
import { SubmissionsToolbar } from "@/components/submissions/SubmissionsToolbar";
import { SubmissionsTable } from "@/components/submissions/SubmissionsTable";
import { QueueTermsCard } from "@/components/submissions/QueueTermsCard";
import { ResolveDrawer } from "@/components/submissions/ResolveDrawer";
import { cx } from "@/lib/submissions/utils";
import { jsonFetch } from "@/lib/http";
import { TinyIcon } from "@/components/ui/TinyIcon";

const QA_PREVIEW_MAX_AGE_MS = 30 * 60 * 1000;

type BatchGradeResponse = {
  requestId?: string;
  summary?: {
    requested: number;
    targeted: number;
    skipped: number;
    succeeded: number;
    failed: number;
    dryRun?: boolean;
  };
};

export default function SubmissionsPage() {
  const {
    busy,
    err,
    msg,
    setErr,
    setMsg,
    refresh,

    unlinkedOnly,
    setUnlinkedOnly,
    readyOnly,
    setReadyOnly,

    timeframe,
    setTimeframe,

    query,
    setQuery,

    statusFilter,
    setStatusFilter,
    laneFilter,
    setLaneFilter,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    handoffOnly,
    setHandoffOnly,
    qaReviewOnly,
    setQaReviewOnly,

    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    totalPages,

    statuses,
    laneGroups,
  } = useSubmissionsList();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [showColWorkflow, setShowColWorkflow] = useState(true);
  const [showColUploaded, setShowColUploaded] = useState(true);
  const [showColGrade, setShowColGrade] = useState(true);
  const [showColAssignmentTitle, setShowColAssignmentTitle] = useState(true);
  const [qaPreviewSignature, setQaPreviewSignature] = useState("");
  const [qaPreviewAt, setQaPreviewAt] = useState<number | null>(null);
  const [qaPreviewRequestId, setQaPreviewRequestId] = useState("");
  const feedbackCacheRef = useRef<Record<string, string | null>>({});

  // Resolve drawer state lives here; drawer owns its internal state.
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveId, setResolveId] = useState<string | null>(null);

  const flatRows = laneGroups.flatMap((lane) => lane.rows);
  const autoReadyCount = laneGroups.find((lane) => lane.key === "AUTO_READY")?.rows.length || 0;
  const needsHumanCount = laneGroups.find((lane) => lane.key === "NEEDS_HUMAN")?.rows.length || 0;
  const blockedCount = laneGroups.find((lane) => lane.key === "BLOCKED")?.rows.length || 0;
  const completedCount = laneGroups.find((lane) => lane.key === "COMPLETED")?.rows.length || 0;
  const byStatus = flatRows.reduce<Record<string, number>>((acc, row) => {
    const k = String(row.status || "UNKNOWN").toUpperCase();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const unlinkedCount = flatRows.filter((s) => !s.studentId).length;
  const exportReady = flatRows.filter((s) => isReadyToUpload(s)).length;
  const failedVisibleCount = flatRows.filter((s) => String(s.status || "").toUpperCase() === "FAILED").length;
  const qaReviewIds = flatRows.filter((s) => Boolean(s.qaFlags?.shouldReview)).map((s) => s.id);
  const qaReviewCount = qaReviewIds.length;
  const qaReviewSignature = qaReviewIds.slice().sort().join("|");
  const qaCommitReady =
    qaReviewCount > 0 &&
    qaPreviewSignature === qaReviewSignature &&
    qaPreviewAt !== null &&
    Date.now() - qaPreviewAt <= QA_PREVIEW_MAX_AGE_MS;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("submissions.columns.v1");
    if (!raw) return;
    try {
      const v = JSON.parse(raw) as Record<string, boolean>;
      if (typeof v.workflow === "boolean") setShowColWorkflow(v.workflow);
      if (typeof v.uploaded === "boolean") setShowColUploaded(v.uploaded);
      if (typeof v.grade === "boolean") setShowColGrade(v.grade);
      if (typeof v.assignmentTitle === "boolean") setShowColAssignmentTitle(v.assignmentTitle);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (qaPreviewSignature && qaPreviewSignature !== qaReviewSignature) {
      setQaPreviewSignature("");
      setQaPreviewAt(null);
      setQaPreviewRequestId("");
    }
  }, [qaPreviewSignature, qaReviewSignature]);

  function persistColumns(next: { workflow?: boolean; uploaded?: boolean; grade?: boolean; assignmentTitle?: boolean }) {
    const payload = {
      workflow: next.workflow ?? showColWorkflow,
      uploaded: next.uploaded ?? showColUploaded,
      grade: next.grade ?? showColGrade,
      assignmentTitle: next.assignmentTitle ?? showColAssignmentTitle,
    };
    if (typeof window !== "undefined") localStorage.setItem("submissions.columns.v1", JSON.stringify(payload));
  }

  function toAbsoluteUrl(url: string) {
    const src = String(url || "").trim();
    if (!src) return "";
    if (/^https?:\/\//i.test(src)) return src;
    if (typeof window === "undefined") return src;
    try {
      return new URL(src, window.location.origin).toString();
    } catch {
      return src;
    }
  }

  async function getLatestFeedbackText(submissionId: string, existingFeedback?: string | null) {
    const existing = String(existingFeedback || "").trim();
    if (existing) return existing;

    const key = String(submissionId || "").trim();
    if (!key) return "";
    if (Object.prototype.hasOwnProperty.call(feedbackCacheRef.current, key)) {
      return String(feedbackCacheRef.current[key] || "");
    }

    const data = await jsonFetch<{ submission?: { assessments?: Array<{ feedbackText?: string | null }> } }>(
      `/api/submissions/${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );
    const feedback = String(data?.submission?.assessments?.[0]?.feedbackText || "").trim();
    feedbackCacheRef.current[key] = feedback || null;
    return feedback;
  }

  async function onCopySummary(s: SubmissionRow) {
    try {
      const feedback = await getLatestFeedbackText(s.id, s.feedback);
      const markedLink = toAbsoluteUrl(buildMarkedPdfUrl(s.id, null, Date.now()));
      const payload = feedback ? `${feedback}\n\nMarked version link: ${markedLink}` : buildCopySummary({ ...s, feedback });
      await navigator.clipboard.writeText(payload);
      setCopiedKey(`summary-${s.id}`);
      window.setTimeout(() => setCopiedKey(null), 1400);
    } catch (e: any) {
      setErr(e?.message || "Could not copy to clipboard.");
    }
  }

  async function onDownloadMarkedFile(s: SubmissionRow) {
    try {
      const href = buildMarkedPdfUrl(s.id, null, Date.now());
      const baseName = String(s.filename || "submission").replace(/\.[^/.]+$/, "");
      const a = document.createElement("a");
      a.href = href;
      a.download = `${baseName}-marked.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setCopiedKey(`file-${s.id}`);
      window.setTimeout(() => setCopiedKey(null), 1400);
    } catch (e: any) {
      setErr(e?.message || "Could not download marked PDF.");
    }
  }

  async function onBulkCopyFeedback(rows: SubmissionRow[]) {
    const completed = rows.filter((r) => isReadyToUpload(r));
    if (!completed.length) return;
    try {
      const rowsWithFeedback = await Promise.all(
        completed.map(async (r) => {
          try {
            const feedback = await getLatestFeedbackText(r.id, r.feedback);
            return { row: r, feedback };
          } catch {
            return { row: r, feedback: String(r.feedback || "").trim() };
          }
        })
      );
      const joined = rowsWithFeedback
        .map(({ row, feedback }) => {
          const marked = toAbsoluteUrl(buildMarkedPdfUrl(row.id, null, Date.now()));
          return `Submission: ${row.filename}\n${feedback}\n\nMarked version link: ${marked}`;
        })
        .join("\n\n====================\n\n");
      await navigator.clipboard.writeText(joined);
      setMsg(`Copied feedback pack for ${completed.length} submission(s).`);
    } catch {
      setErr("Could not copy bulk feedback pack.");
    }
  }

  function onBulkDownloadMarked(rows: SubmissionRow[]) {
    const completed = rows.filter((r) => isReadyToUpload(r));
    if (!completed.length) return;
    // Stagger download triggers to reduce browser multi-download throttling.
    completed.forEach((r, idx) => {
      window.setTimeout(() => {
        void onDownloadMarkedFile(r);
      }, idx * 180);
    });
  }

  function onOpenResolve(id: string) {
    setResolveId(id);
    setResolveOpen(true);
  }

  async function onLinked() {
    setResolveOpen(false);
    await refresh();
  }

  async function runBatchGrade(
    submissionIds: string[],
    options?: {
      retryFailedOnly?: boolean;
      dryRun?: boolean;
      previewContext?: {
        linkedPreviewRequestId?: string | null;
        linkedPreviewSignature?: string | null;
        linkedPreviewAt?: string | null;
        queueSizeAtPreview?: number | null;
      };
    }
  ): Promise<{ ok: boolean; requestId: string | null }> {
    if (!submissionIds.length) return { ok: false, requestId: null };
    const retryFailedOnly = !!options?.retryFailedOnly;
    const dryRun = !!options?.dryRun;
    setBatchBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await jsonFetch<BatchGradeResponse>("/api/submissions/batch-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionIds,
          dryRun,
          retryFailedOnly,
          forceRetry: retryFailedOnly,
          concurrency: 1,
          previewContext: options?.previewContext,
        }),
      });
      const s = res.summary;
      await refresh();
      if (s) {
        const label = dryRun
          ? "Batch preview complete"
          : retryFailedOnly
            ? "Retry batch complete"
            : "Batch grading complete";
        setMsg(`${label}: ${s.succeeded} succeeded, ${s.failed} failed, ${s.skipped} skipped.`);
      }
      return { ok: true, requestId: String(res.requestId || "").trim() || null };
    } catch (e: any) {
      setErr(e?.message || (dryRun ? "Batch preview failed." : "Batch grading failed."));
      return { ok: false, requestId: null };
    } finally {
      setBatchBusy(false);
    }
  }

  async function onRegradeByBriefMapping() {
    const input = window.prompt(
      "Enter Assignment Brief ID, or UnitCode + Assignment (example: 4014 A2)",
      ""
    );
    const raw = String(input || "").trim();
    if (!raw) return;
    const byId = /^[a-z0-9-]{16,}$/i.test(raw) && raw.includes("-");
    const unitMatch = raw.match(/^(\d{4})\s+([aA]\d{1,2})$/);
    const reason = window.prompt("Reason for impacted regrade (audit log)", "brief mapping updated") || "";

    setBatchBusy(true);
    setErr("");
    setMsg("");
    try {
      const body = byId
        ? { assignmentBriefId: raw, forceRetry: true, concurrency: 1, operationReason: reason }
        : unitMatch
          ? {
              unitCode: unitMatch[1],
              assignmentRef: unitMatch[2].toUpperCase(),
              forceRetry: true,
              concurrency: 1,
              operationReason: reason,
            }
          : null;
      if (!body) {
        setErr("Invalid format. Use brief id or format like: 4014 A2");
        return;
      }
      const res = await jsonFetch<BatchGradeResponse>("/api/submissions/batch-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const s = res.summary;
      await refresh();
      if (s) {
        setMsg(`Impacted regrade complete: ${s.succeeded} succeeded, ${s.failed} failed, ${s.skipped} skipped.`);
      }
    } catch (e: any) {
      setErr(e?.message || "Impacted regrade failed.");
    } finally {
      setBatchBusy(false);
    }
  }

  function onBatchGradeVisible() {
    const ids = flatRows.map((s) => s.id);
    void runBatchGrade(ids, { retryFailedOnly: false });
  }

  function onRetryFailed() {
    const ids = flatRows
      .filter((s) => String(s.status || "").toUpperCase() === "FAILED")
      .map((s) => s.id);
    void runBatchGrade(ids, { retryFailedOnly: true });
  }

  function onBatchGradeAutoReady() {
    const ids =
      laneGroups
        .find((lane) => lane.key === "AUTO_READY")
        ?.rows.map((s) => s.id) || [];
    void runBatchGrade(ids, { retryFailedOnly: false });
  }

  async function onBatchPreviewQaReview() {
    const ids = [...qaReviewIds];
    const sig = qaReviewSignature;
    const res = await runBatchGrade(ids, { retryFailedOnly: false, dryRun: true });
    if (res.ok) {
      setQaPreviewSignature(sig);
      setQaPreviewAt(Date.now());
      setQaPreviewRequestId(res.requestId || "");
    }
  }

  function onBatchGradeQaReview() {
    const ids = [...qaReviewIds];
    if (!ids.length) return;
    if (!qaCommitReady) {
      setErr("Run 'Preview QA lane' on the current QA queue before commit grading.");
      return;
    }
    const confirmed = window.confirm(
      `Commit grading for ${ids.length} QA-flagged submission(s)?\n\nTip: run 'Preview QA lane' first to inspect outcomes before commit.`
    );
    if (!confirmed) return;
    void runBatchGrade(ids, {
      retryFailedOnly: false,
      dryRun: false,
      previewContext: {
        linkedPreviewRequestId: qaPreviewRequestId || null,
        linkedPreviewSignature: qaPreviewSignature || null,
        linkedPreviewAt: qaPreviewAt ? new Date(qaPreviewAt).toISOString() : null,
        queueSizeAtPreview: qaReviewCount,
      },
    });
  }

  function onBatchGradeLane(laneKey: LaneKey) {
    const ids = laneGroups.find((lane) => lane.key === laneKey)?.rows.map((s) => s.id) || [];
    void runBatchGrade(ids, { retryFailedOnly: false });
  }

  function onRunGradeSingle(submissionId: string) {
    void runBatchGrade([submissionId], { retryFailedOnly: false });
  }

  function onRetryFailedLane(laneKey: LaneKey) {
    const ids =
      laneGroups
        .find((lane) => lane.key === laneKey)
        ?.rows.filter((s) => String(s.status || "").toUpperCase() === "FAILED")
        .map((s) => s.id) || [];
    void runBatchGrade(ids, { retryFailedOnly: true });
  }

  return (
    <main className="py-2">
      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-slate-300 bg-gradient-to-r from-slate-100 via-white to-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-900">
              <TinyIcon name="workflow" className="h-3 w-3" />
              Workflow Operations
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Submissions Workspace</h1>
            <p className="text-[11px] text-zinc-600">
              Batch intake, extraction tracking, student resolution, and grading readiness in one place.
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-700 px-3 text-[11px] font-semibold text-white hover:bg-sky-800"
            title="Upload assignment"
          >
            <TinyIcon name="upload" className="h-3 w-3" />
            Upload assignment
          </Link>
        </div>

        <div className="flex flex-wrap gap-1 text-[11px]">
          <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-800">
            Visible <span className="font-semibold text-zinc-900">{flatRows.length}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">
            Missing <span className="font-semibold">{unlinkedCount}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-900">
            Extracted <span className="font-semibold">{(byStatus.EXTRACTED || 0) + (byStatus.DONE || 0)}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-900">
            Export <span className="font-semibold">{exportReady}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-900">
            QA <span className="font-semibold">{qaReviewCount}</span>
          </div>
        </div>

        <details className="text-[11px]">
          <summary className="flex cursor-pointer items-center justify-between gap-2 text-zinc-500">
            <span>Columns</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-400">toggle</span>
          </summary>
          <div className="mt-2 flex flex-wrap gap-1">
            <label className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px]">
              <input type="checkbox" checked={showColGrade} onChange={(e) => { setShowColGrade(e.target.checked); persistColumns({ grade: e.target.checked }); }} className="h-3 w-3" />
              Grade
            </label>
            <label className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px]">
              <input type="checkbox" checked={showColWorkflow} onChange={(e) => { setShowColWorkflow(e.target.checked); persistColumns({ workflow: e.target.checked }); }} className="h-3 w-3" />
              Workflow
            </label>
            <label className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px]">
              <input type="checkbox" checked={showColUploaded} onChange={(e) => { setShowColUploaded(e.target.checked); persistColumns({ uploaded: e.target.checked }); }} className="h-3 w-3" />
              Uploaded
            </label>
            <label className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px]">
              <input type="checkbox" checked={showColAssignmentTitle} onChange={(e) => { setShowColAssignmentTitle(e.target.checked); persistColumns({ assignmentTitle: e.target.checked }); }} className="h-3 w-3" />
              Assignment title
            </label>
          </div>
        </details>

      </div>

      {(err || msg) && (
        <div
          className={cx(
            "mb-4 rounded-xl border p-3 text-sm",
            err ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
          )}
        >
          {err || msg}
        </div>
      )}

      <div className="space-y-3">
      <QueueTermsCard />
      <SubmissionsToolbar
        busy={busy}
        refresh={refresh}
        batchBusy={batchBusy}
        visibleCount={flatRows.length}
        autoReadyCount={autoReadyCount}
        needsHumanCount={needsHumanCount}
        blockedCount={blockedCount}
        completedCount={completedCount}
        failedVisibleCount={failedVisibleCount}
        onBatchGradeAutoReady={onBatchGradeAutoReady}
        onBatchGradeVisible={onBatchGradeVisible}
        onBatchPreviewQaReview={onBatchPreviewQaReview}
        onBatchGradeQaReview={onBatchGradeQaReview}
        onRetryFailed={onRetryFailed}
        onRegradeByBriefMapping={onRegradeByBriefMapping}
        unlinkedOnly={unlinkedOnly}
        setUnlinkedOnly={setUnlinkedOnly}
        readyOnly={readyOnly}
        setReadyOnly={setReadyOnly}
        timeframe={timeframe}
        setTimeframe={setTimeframe}
        query={query}
        setQuery={setQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        laneFilter={laneFilter}
        setLaneFilter={setLaneFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        sortDir={sortDir}
        setSortDir={setSortDir}
        handoffOnly={handoffOnly}
        setHandoffOnly={setHandoffOnly}
        qaReviewOnly={qaReviewOnly}
        setQaReviewOnly={setQaReviewOnly}
        qaReviewCount={qaReviewCount}
        qaCommitReady={qaCommitReady}
        statuses={statuses}
      />

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
        <div>
          Server results: <span className="font-semibold text-zinc-900">{totalItems}</span> rows · Page{" "}
          <span className="font-semibold text-zinc-900">{page}</span> of{" "}
          <span className="font-semibold text-zinc-900">{Math.max(1, totalPages)}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1">
            <span className="text-zinc-600">Page size</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Math.max(10, Math.min(200, Number(e.target.value) || 40)))}
              className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs"
            >
              {[40, 80, 120, 160].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={busy || page <= 1}
            className={cx(
              "inline-flex h-8 items-center rounded-lg border px-2.5 font-semibold",
              busy || page <= 1 ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
            )}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(Math.max(1, totalPages), p + 1))}
            disabled={busy || page >= totalPages}
            className={cx(
              "inline-flex h-8 items-center rounded-lg border px-2.5 font-semibold",
              busy || page >= totalPages ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
            )}
          >
            Next
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <SubmissionsTable
          laneGroups={laneGroups}
          batchBusy={batchBusy}
          unlinkedOnly={unlinkedOnly}
          onBatchGradeLane={onBatchGradeLane}
          onRetryFailedLane={onRetryFailedLane}
          onRunGradeSingle={onRunGradeSingle}
          onOpenResolve={onOpenResolve}
          onCopySummary={onCopySummary}
          onDownloadMarkedFile={onDownloadMarkedFile}
          onBulkCopyFeedback={onBulkCopyFeedback}
          onBulkDownloadMarked={onBulkDownloadMarked}
          showColWorkflow={showColWorkflow}
          showColUploaded={showColUploaded}
          showColGrade={showColGrade}
          showColAssignmentTitle={showColAssignmentTitle}
          copiedKey={copiedKey}
        />
      </section>
      </div>

      <ResolveDrawer
        open={resolveOpen}
        submissionId={resolveId}
        busyGlobal={busy}
        onClose={() => setResolveOpen(false)}
        onLinked={onLinked}
      />
    </main>
  );
}
