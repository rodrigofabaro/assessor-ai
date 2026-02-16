"use client";

import Link from "next/link";
import type { Timeframe } from "@/lib/submissions/useSubmissionsList";
import { cx } from "@/lib/submissions/utils";
import { IconButton } from "./IconButton";

export function SubmissionsToolbar({
  busy,
  refresh,
  batchBusy,
  visibleCount,
  failedVisibleCount,
  onBatchGradeVisible,
  onRetryFailed,

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
}: {
  busy: boolean;
  refresh: () => void;
  batchBusy: boolean;
  visibleCount: number;
  failedVisibleCount: number;
  onBatchGradeVisible: () => void;
  onRetryFailed: () => void;

  unlinkedOnly: boolean;
  setUnlinkedOnly: (v: boolean) => void;

  readyOnly: boolean;
  setReadyOnly: (v: boolean) => void;

  timeframe: Timeframe;
  setTimeframe: (v: Timeframe) => void;

  query: string;
  setQuery: (v: string) => void;

  statusFilter: string;
  setStatusFilter: (v: string) => void;

  statuses: string[];
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300"
              checked={unlinkedOnly}
              onChange={(e) => setUnlinkedOnly(e.target.checked)}
            />
            Unlinked only
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300"
              checked={readyOnly}
              onChange={(e) => setReadyOnly(e.target.checked)}
            />
            Ready to upload
          </label>

          <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <button
              type="button"
              onClick={() => setTimeframe("today")}
              className={cx(
                "px-3 py-2 text-sm font-semibold",
                timeframe === "today" ? "bg-zinc-100 text-zinc-900" : "bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setTimeframe("week")}
              className={cx(
                "px-3 py-2 text-sm font-semibold",
                timeframe === "week" ? "bg-zinc-100 text-zinc-900" : "bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              This week
            </button>
            <button
              type="button"
              onClick={() => setTimeframe("all")}
              className={cx(
                "px-3 py-2 text-sm font-semibold",
                timeframe === "all" ? "bg-zinc-100 text-zinc-900" : "bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              All
            </button>
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: filename, student, email, AB number…"
            className="h-9 w-[280px] rounded-xl border border-zinc-300 px-3 text-sm"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {statuses.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-zinc-500 hidden sm:block">
            Tip: resolve unlinked rows first, then run grading.
          </div>
          <button
            type="button"
            onClick={onBatchGradeVisible}
            disabled={batchBusy || visibleCount === 0}
            className={cx(
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-sm",
              batchBusy || visibleCount === 0
                ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                : "bg-sky-700 text-white hover:bg-sky-800"
            )}
            title="Grade all visible submissions"
          >
            {batchBusy ? "Queueing..." : `Grade visible (${visibleCount})`}
          </button>
          <button
            type="button"
            onClick={onRetryFailed}
            disabled={batchBusy || failedVisibleCount === 0}
            className={cx(
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-sm",
              batchBusy || failedVisibleCount === 0
                ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                : "bg-amber-600 text-white hover:bg-amber-700"
            )}
            title="Retry failed submissions in current view"
          >
            {`Retry failed (${failedVisibleCount})`}
          </button>
          <IconButton title="Refresh" onClick={refresh} disabled={busy}>
            ↻ <span>Refresh</span>
          </IconButton>
          <Link
            href="/submissions/new"
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
            title="Upload"
          >
            ⬆ <span>Upload</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
