"use client";

import { useState } from "react";
import { buildCopySummary } from "@/lib/submissionReady";
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
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Upload log and processing status. When a submission is unlinked, use <span className="font-medium">Resolve</span> to read the file hints and attach the correct student.
        </p>
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

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm mt-4">
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
