"use client";

import { useState } from "react";
import { buildCopySummary } from "@/lib/submissionReady";
import { isReadyToUpload } from "@/lib/submissionReady";
import { useSubmissionsList, type LaneKey } from "@/lib/submissions/useSubmissionsList";
import type { SubmissionRow } from "@/lib/submissions/types";
import { buildMarkedPdfUrl } from "@/lib/submissions/markedPdfUrl";
import { SubmissionsToolbar } from "@/components/submissions/SubmissionsToolbar";
import { SubmissionsTable } from "@/components/submissions/SubmissionsTable";
import { ResolveDrawer } from "@/components/submissions/ResolveDrawer";
import { cx } from "@/lib/submissions/utils";
import { jsonFetch } from "@/lib/http";

type BatchGradeResponse = {
  summary?: {
    requested: number;
    targeted: number;
    skipped: number;
    succeeded: number;
    failed: number;
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

    statuses,
    laneGroups,
  } = useSubmissionsList();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

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

  async function onCopySummary(s: SubmissionRow) {
    try {
      const feedback = String(s.feedback || "").trim();
      const markedLink = toAbsoluteUrl(buildMarkedPdfUrl(s.id, null, Date.now()));
      const payload = feedback ? `${feedback}\n\nMarked version link: ${markedLink}` : buildCopySummary(s);
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

  function onOpenResolve(id: string) {
    setResolveId(id);
    setResolveOpen(true);
  }

  async function onLinked() {
    setResolveOpen(false);
    await refresh();
  }

  async function runBatchGrade(submissionIds: string[], retryFailedOnly = false) {
    if (!submissionIds.length) return;
    setBatchBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await jsonFetch<BatchGradeResponse>("/api/submissions/batch-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionIds,
          retryFailedOnly,
          forceRetry: retryFailedOnly,
          concurrency: 1,
        }),
      });
      const s = res.summary;
      await refresh();
      if (s) {
        const label = retryFailedOnly ? "Retry batch complete" : "Batch grading complete";
        setMsg(`${label}: ${s.succeeded} succeeded, ${s.failed} failed, ${s.skipped} skipped.`);
      }
    } catch (e: any) {
      setErr(e?.message || "Batch grading failed.");
    } finally {
      setBatchBusy(false);
    }
  }

  function onBatchGradeVisible() {
    const ids = flatRows.map((s) => s.id);
    runBatchGrade(ids, false);
  }

  function onRetryFailed() {
    const ids = flatRows
      .filter((s) => String(s.status || "").toUpperCase() === "FAILED")
      .map((s) => s.id);
    runBatchGrade(ids, true);
  }

  function onBatchGradeAutoReady() {
    const ids =
      laneGroups
        .find((lane) => lane.key === "AUTO_READY")
        ?.rows.map((s) => s.id) || [];
    runBatchGrade(ids, false);
  }

  function onBatchGradeLane(laneKey: LaneKey) {
    const ids = laneGroups.find((lane) => lane.key === laneKey)?.rows.map((s) => s.id) || [];
    runBatchGrade(ids, false);
  }

  function onRetryFailedLane(laneKey: LaneKey) {
    const ids =
      laneGroups
        .find((lane) => lane.key === laneKey)
        ?.rows.filter((s) => String(s.status || "").toUpperCase() === "FAILED")
        .map((s) => s.id) || [];
    runBatchGrade(ids, true);
  }

  return (
    <main className="py-2">
      <div className="mb-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Submissions Workspace</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Batch intake, extraction tracking, student resolution, and grading readiness in one place.
            </p>
          </div>
          <a
            href="/upload"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800"
          >
            Upload new files
          </a>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Visible submissions</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">{flatRows.length}</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Need student link</div>
            <div className="mt-1 text-xl font-semibold text-amber-900">{unlinkedCount}</div>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">Extracted</div>
            <div className="mt-1 text-xl font-semibold text-sky-900">{(byStatus.EXTRACTED || 0) + (byStatus.DONE || 0)}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Export-ready</div>
            <div className="mt-1 text-xl font-semibold text-emerald-900">{exportReady}</div>
          </div>
        </div>
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
        onRetryFailed={onRetryFailed}
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
        statuses={statuses}
      />

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <SubmissionsTable
          laneGroups={laneGroups}
          batchBusy={batchBusy}
          unlinkedOnly={unlinkedOnly}
          onBatchGradeLane={onBatchGradeLane}
          onRetryFailedLane={onRetryFailedLane}
          onOpenResolve={onOpenResolve}
          onCopySummary={onCopySummary}
          onDownloadMarkedFile={onDownloadMarkedFile}
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
