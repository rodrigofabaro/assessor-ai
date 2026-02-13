"use client";

import { useState } from "react";
import { buildCopySummary } from "@/lib/submissionReady";
import { isReadyToUpload } from "@/lib/submissionReady";
import { useSubmissionsList } from "@/lib/submissions/useSubmissionsList";
import type { SubmissionRow } from "@/lib/submissions/types";
import { SubmissionsToolbar } from "@/components/submissions/SubmissionsToolbar";
import { SubmissionsTable } from "@/components/submissions/SubmissionsTable";
import { ResolveDrawer } from "@/components/submissions/ResolveDrawer";
import { cx } from "@/lib/submissions/utils";

export default function SubmissionsPage() {
  const {
    busy,
    err,
    msg,
    setErr,
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

    statuses,
    dayGroups,
  } = useSubmissionsList();

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Resolve drawer state lives here; drawer owns its internal state.
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveId, setResolveId] = useState<string | null>(null);

  const flatRows = dayGroups.flatMap(([, rows]) => rows);
  const byStatus = flatRows.reduce<Record<string, number>>((acc, row) => {
    const k = String(row.status || "UNKNOWN").toUpperCase();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const unlinkedCount = flatRows.filter((s) => !s.studentId).length;
  const exportReady = flatRows.filter((s) => isReadyToUpload(s)).length;

  async function onCopySummary(s: SubmissionRow) {
    try {
      await navigator.clipboard.writeText(buildCopySummary(s));
      setCopiedId(s.id);
      window.setTimeout(() => setCopiedId(null), 1400);
    } catch (e: any) {
      setErr(e?.message || "Could not copy to clipboard.");
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

  return (
    <main className="mx-auto max-w-6xl p-6">
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
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
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

      <SubmissionsToolbar
        busy={busy}
        refresh={refresh}
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
        statuses={statuses}
      />

      <section className="mt-4 rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <SubmissionsTable
          dayGroups={dayGroups}
          unlinkedOnly={unlinkedOnly}
          onOpenResolve={onOpenResolve}
          onCopySummary={onCopySummary}
          copiedId={copiedId}
        />
      </section>

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
