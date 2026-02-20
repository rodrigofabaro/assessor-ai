"use client";
import type { LaneFilter, SortBy, SortDir, Timeframe } from "@/lib/submissions/useSubmissionsList";
import { cx } from "@/lib/submissions/utils";
import { IconButton } from "./IconButton";

export function SubmissionsToolbar({
  busy,
  refresh,
  batchBusy,
  visibleCount,
  autoReadyCount,
  needsHumanCount,
  blockedCount,
  completedCount,
  failedVisibleCount,
  onBatchGradeAutoReady,
  onBatchGradeVisible,
  onBatchPreviewQaReview,
  onBatchGradeQaReview,
  onRetryFailed,
  onRegradeByBriefMapping,

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
  qaReviewCount,
  qaCommitReady,

  statuses,
}: {
  busy: boolean;
  refresh: () => void;
  batchBusy: boolean;
  visibleCount: number;
  autoReadyCount: number;
  needsHumanCount: number;
  blockedCount: number;
  completedCount: number;
  failedVisibleCount: number;
  onBatchGradeAutoReady: () => void;
  onBatchGradeVisible: () => void;
  onBatchPreviewQaReview: () => void | Promise<void>;
  onBatchGradeQaReview: () => void;
  onRetryFailed: () => void;
  onRegradeByBriefMapping: () => void;

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

  laneFilter: LaneFilter;
  setLaneFilter: (v: LaneFilter) => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  sortDir: SortDir;
  setSortDir: (v: SortDir) => void;
  handoffOnly: boolean;
  setHandoffOnly: (v: boolean) => void;
  qaReviewOnly: boolean;
  setQaReviewOnly: (v: boolean) => void;
  qaReviewCount: number;
  qaCommitReady: boolean;

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

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: filename, student, email, AB number…"
            className="h-9 w-[240px] rounded-xl border border-zinc-300 px-3 text-sm"
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

          <select
            value={laneFilter}
            onChange={(e) => setLaneFilter(e.target.value as LaneFilter)}
            className="h-9 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
            aria-label="Filter by lane"
          >
            <option value="ALL">All lanes</option>
            <option value="QA_REVIEW">QA review</option>
            <option value="AUTO_READY">Auto-Ready</option>
            <option value="NEEDS_HUMAN">Needs Human</option>
            <option value="BLOCKED">Blocked</option>
            <option value="COMPLETED">Completed</option>
          </select>

          <details className="group rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1">
            <summary className="cursor-pointer list-none text-xs font-semibold text-zinc-700 [&::-webkit-details-marker]:hidden">
              More filters
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300"
                  checked={handoffOnly}
                  onChange={(e) => setHandoffOnly(e.target.checked)}
                />
                Handoff mode
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300"
                  checked={qaReviewOnly}
                  onChange={(e) => setQaReviewOnly(e.target.checked)}
                />
                QA review only
              </label>

              <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <button
                  type="button"
                  onClick={() => setTimeframe("today")}
                  className={cx(
                    "px-3 py-2 text-sm font-semibold",
                    timeframe === "today" ? "bg-sky-50 text-sky-900" : "bg-white text-zinc-700 hover:bg-zinc-50"
                  )}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setTimeframe("week")}
                  className={cx(
                    "px-3 py-2 text-sm font-semibold",
                    timeframe === "week" ? "bg-sky-50 text-sky-900" : "bg-white text-zinc-700 hover:bg-zinc-50"
                  )}
                >
                  This week
                </button>
                <button
                  type="button"
                  onClick={() => setTimeframe("all")}
                  className={cx(
                    "px-3 py-2 text-sm font-semibold",
                    timeframe === "all" ? "bg-sky-50 text-sky-900" : "bg-white text-zinc-700 hover:bg-zinc-50"
                  )}
                >
                  All
                </button>
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="h-9 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                aria-label="Sort by"
              >
                <option value="uploadedAt">Sort: uploaded</option>
                <option value="student">Sort: student</option>
                <option value="status">Sort: status</option>
                <option value="grade">Sort: grade</option>
              </select>

              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as SortDir)}
                className="h-9 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                aria-label="Sort direction"
              >
                <option value="desc">Order: desc</option>
                <option value="asc">Order: asc</option>
              </select>
            </div>
          </details>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="hidden items-center gap-1 lg:flex">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-600">
              Auto {autoReadyCount}
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-600">
              Human {needsHumanCount}
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-600">
              Blocked {blockedCount}
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-600">
              Done {completedCount}
            </span>
            <span className={cx(
              "rounded-full border px-2 py-1 text-[10px] font-semibold",
              qaCommitReady ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
            )}>
              QA {qaReviewCount}
            </span>
          </div>

          <button
            type="button"
            onClick={onBatchGradeAutoReady}
            disabled={batchBusy || autoReadyCount === 0}
            className={cx(
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-sm",
              batchBusy || autoReadyCount === 0
                ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                : "bg-emerald-700 text-white hover:bg-emerald-800"
            )}
            title="Grade only automation-ready submissions"
          >
            {batchBusy ? "Queueing..." : `Grade auto-ready (${autoReadyCount})`}
          </button>

          <details className="group relative">
            <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 [&::-webkit-details-marker]:hidden">
              Batch actions
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-[260px] rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
              <div className="grid gap-1.5">
                <button
                  type="button"
                  onClick={onBatchGradeVisible}
                  disabled={batchBusy || visibleCount === 0}
                  className={cx(
                    "w-full rounded-lg px-3 py-2 text-left text-sm font-semibold",
                    batchBusy || visibleCount === 0
                      ? "cursor-not-allowed bg-zinc-100 text-zinc-500"
                      : "bg-sky-50 text-sky-900 hover:bg-sky-100"
                  )}
                  title="Grade all visible submissions"
                >
                  Grade visible ({visibleCount})
                </button>
                <button
                  type="button"
                  onClick={onBatchPreviewQaReview}
                  disabled={batchBusy || qaReviewCount === 0}
                  className={cx(
                    "w-full rounded-lg px-3 py-2 text-left text-sm font-semibold",
                    batchBusy || qaReviewCount === 0
                      ? "cursor-not-allowed bg-zinc-100 text-zinc-500"
                      : "bg-rose-50 text-rose-900 hover:bg-rose-100"
                  )}
                  title="Run dry-run grading preview for QA queue submissions"
                >
                  Preview QA lane ({qaReviewCount})
                </button>
                <button
                  type="button"
                  onClick={onBatchGradeQaReview}
                  disabled={batchBusy || qaReviewCount === 0 || !qaCommitReady}
                  className={cx(
                    "w-full rounded-lg px-3 py-2 text-left text-sm font-semibold",
                    batchBusy || qaReviewCount === 0 || !qaCommitReady
                      ? "cursor-not-allowed bg-zinc-100 text-zinc-500"
                      : "bg-rose-100 text-rose-900 hover:bg-rose-200"
                  )}
                  title={
                    qaCommitReady
                      ? "Commit grading for QA queue submissions"
                      : "Run Preview QA lane for the current QA queue before commit"
                  }
                >
                  Commit QA lane ({qaReviewCount})
                </button>
                <button
                  type="button"
                  onClick={onRetryFailed}
                  disabled={batchBusy || failedVisibleCount === 0}
                  className={cx(
                    "w-full rounded-lg px-3 py-2 text-left text-sm font-semibold",
                    batchBusy || failedVisibleCount === 0
                      ? "cursor-not-allowed bg-zinc-100 text-zinc-500"
                      : "bg-amber-50 text-amber-900 hover:bg-amber-100"
                  )}
                  title="Retry failed submissions in current view"
                >
                  Retry failed ({failedVisibleCount})
                </button>
                <button
                  type="button"
                  onClick={onRegradeByBriefMapping}
                  disabled={batchBusy}
                  className={cx(
                    "w-full rounded-lg px-3 py-2 text-left text-sm font-semibold",
                    batchBusy ? "cursor-not-allowed bg-zinc-100 text-zinc-500" : "bg-violet-50 text-violet-900 hover:bg-violet-100"
                  )}
                  title="Regrade all submissions affected by a changed brief mapping"
                >
                  Regrade impacted
                </button>
              </div>
            </div>
          </details>

          <IconButton title="Refresh" onClick={refresh} disabled={busy}>
            ↻ <span>Refresh</span>
          </IconButton>
        </div>
      </div>
    </section>
  );
}
