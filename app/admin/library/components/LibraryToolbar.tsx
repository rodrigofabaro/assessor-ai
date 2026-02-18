"use client";

export function LibraryToolbar(props: {
  q: string;
  setQ: (v: string) => void;
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
  busy: string | null;
  refreshAll: () => void;
}) {
  const { q, setQ, showArchived, setShowArchived, busy, refreshAll } = props;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-[240px]">
        <div className="text-xs text-zinc-600">Search</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="unit code, title, issue label..."
          className="mt-1 h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>

        <button
          onClick={refreshAll}
          disabled={!!busy}
          className={
            "h-10 rounded-xl px-4 text-sm font-semibold shadow-sm " +
            (busy ? "cursor-not-allowed bg-zinc-300 text-zinc-600" : "bg-sky-700 text-white hover:bg-sky-800")
          }
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

