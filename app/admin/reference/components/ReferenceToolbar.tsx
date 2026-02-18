import { STATUS_FILTER_OPTIONS, type InboxFiltersState } from "../reference.logic";

export function ReferenceToolbar({
  filters,
  setFilters,
  resetFilters,
  counts,
}: {
  filters: InboxFiltersState;
  setFilters: (next: InboxFiltersState) => void;
  resetFilters: () => void;
  counts: { total: number; shown: number; byStatus: Record<string, number> };
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Inbox</h2>
          <p className="mt-1 text-xs text-zinc-500">Filter and select a document to review.</p>
        </div>

        <button
          onClick={resetFilters}
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Reset filters
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        <input
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder="Search title, filename, unit code…"
          className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value as any })}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
          >
            <option value="">All types</option>
            <option value="SPEC">SPEC</option>
            <option value="BRIEF">BRIEF</option>
            <option value="RUBRIC">RUBRIC</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="UPLOADED">UPLOADED</option>
            <option value="EXTRACTED">EXTRACTED</option>
            <option value="REVIEWED">REVIEWED</option>
            <option value="LOCKED">LOCKED</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={filters.onlyLocked}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  onlyLocked: e.target.checked,
                  onlyUnlocked: e.target.checked ? false : filters.onlyUnlocked,
                })
              }
            />
            Only locked
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={filters.onlyUnlocked}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  onlyUnlocked: e.target.checked,
                  onlyLocked: e.target.checked ? false : filters.onlyLocked,
                })
              }
            />
            Only unlocked
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value as any })}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
          >
            <option value="updated">Sort: updated</option>
            <option value="uploaded">Sort: uploaded</option>
            <option value="title">Sort: title</option>
          </select>

          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
            Showing <span className="font-semibold text-zinc-900">{counts.shown}</span> of{" "}
            <span className="font-semibold text-zinc-900">{counts.total}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {STATUS_FILTER_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilters({ ...filters, status: filters.status === s ? "" : (s as any) })}
              className={
                "rounded-full border px-3 py-1 font-semibold " +
                (filters.status === s
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50")
              }
            >
              {s} <span className="opacity-70">({counts.byStatus[s] || 0})</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
